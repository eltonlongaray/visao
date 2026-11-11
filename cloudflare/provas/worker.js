// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — CONFIG
// BLOCO 2 — QUEM É (token do Supabase) E O QUE PODE VER
// BLOCO 3 — HANDLER (enviar, baixar, conferir, listar, apagar)
// BLOCO 4 — ARQUIVOS (fotos do chat, arquivos, fotos do corpo, foto de perfil)
// ─────────────────────────────────────────────────────────────
// Vídeos e prints das provas dos desafios no R2 (19/10/2026): no Supabase o
// tráfego de saída grátis é 5 GB/mês e os vídeos estouraram; o R2 não cobra
// saída. Caminho igual ao do Supabase (uid/video-...), com ".r2" antes da
// extensão pra o app saber onde está. Quem pode ver segue as mesmas regras do
// banco: o Worker pergunta ao Supabase com o token da própria pessoa.

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CONFIG
// ═══════════════════════════════════════════════════════════════
const ORIGENS = ['https://estilo-falcon.web.app', 'https://estilo-falcon.firebaseapp.com', 'http://localhost:8765'];
const MAX_BYTES = 95 * 1024 * 1024;   // Worker grátis aceita até 100 MB por envio
const CAMINHO_OK = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.r2\.[a-z0-9]{2,5}$/;

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: QUEM É E O QUE PODE VER
// ═══════════════════════════════════════════════════════════════
async function quemE(req, env) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: env.SUPABASE_KEY } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id ? { id: u.id, auth } : null;
}

// Pode ver se é dono do arquivo, ou se o check-in/prenda que usa esse caminho
// aparece pra ele no banco (RLS do Supabase) e o vídeo ainda não saiu.
async function podeVer(caminhos, quem, env) {
  const meus = caminhos.filter(c => c.startsWith(quem.id + '/'));
  const outros = caminhos.filter(c => !meus.includes(c));
  const ok = new Set(meus);
  if (!outros.length) return ok;
  const h = { Authorization: quem.auth, apikey: env.SUPABASE_KEY };
  const agora = new Date().toISOString();
  const lista = outros.map(c => `"${c}"`).join(',');
  const base = env.SUPABASE_URL + '/rest/v1';
  const [ck, pr] = await Promise.all([
    fetch(`${base}/desafio_checkins?select=video_path,print_path,video_expira_em&or=(video_path.in.(${encodeURIComponent(lista)}),print_path.in.(${encodeURIComponent(lista)}))`, { headers: h })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/desafio_prendas?select=video_path&video_path=in.(${encodeURIComponent(lista)})&expira_em=gt.${encodeURIComponent(agora)}`, { headers: h })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  for (const c of ck || []) {
    if (c.video_expira_em && c.video_expira_em < agora) continue;
    if (c.video_path) ok.add(c.video_path);
    if (c.print_path) ok.add(c.print_path);
  }
  for (const p of pr || []) if (p.video_path) ok.add(p.video_path);
  return ok;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HANDLER
// ═══════════════════════════════════════════════════════════════
function cors(req) {
  const origem = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (req, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    if (new URL(req.url).pathname.startsWith('/a/')) return arquivos(req, env);
    const quem = await quemE(req, env);
    if (!quem) return json(req, { erro: 'precisa estar logado' }, 401);
    const url = new URL(req.url);
    const caminho = decodeURIComponent(url.pathname.replace(/^\/o\//, ''));

    // POST /conferir { caminhos: [...] } → quais existem e a pessoa pode ver
    if (req.method === 'POST' && url.pathname === '/conferir') {
      const body = await req.json().catch(() => ({}));
      const pedidos = [...new Set((body.caminhos || []).filter(c => CAMINHO_OK.test(c)))].slice(0, 100);
      const pode = await podeVer(pedidos, quem, env);
      const existem = await Promise.all([...pode].map(async c => (await env.PROVAS.head(c)) ? c : null));
      return json(req, { ok: existem.filter(Boolean) });
    }
    // GET /lista → os meus arquivos (faxina do app)
    if (req.method === 'GET' && url.pathname === '/lista') {
      const r = await env.PROVAS.list({ prefix: quem.id + '/', limit: 500 });
      return json(req, { arquivos: r.objects.map(o => ({ caminho: o.key, criado: o.uploaded })) });
    }
    if (!url.pathname.startsWith('/o/') || !CAMINHO_OK.test(caminho)) return json(req, { erro: 'caminho' }, 400);
    const meu = caminho.startsWith(quem.id + '/');

    if (req.method === 'PUT') {
      if (!meu) return json(req, { erro: 'só na própria pasta' }, 403);
      const tam = Number(req.headers.get('Content-Length') || 0);
      if (!tam || tam > MAX_BYTES) return json(req, { erro: 'tamanho' }, 413);
      const tipo = req.headers.get('Content-Type') || 'application/octet-stream';
      if (!/^(video|image)\//.test(tipo)) return json(req, { erro: 'tipo' }, 415);
      await env.PROVAS.put(caminho, req.body, { httpMetadata: { contentType: tipo } });
      return json(req, { ok: true, caminho });
    }
    if (req.method === 'DELETE') {
      if (!meu) return json(req, { erro: 'só na própria pasta' }, 403);
      await env.PROVAS.delete(caminho);
      return json(req, { ok: true });
    }
    if (req.method === 'GET') {
      if (!(await podeVer([caminho], quem, env)).has(caminho)) return json(req, { erro: 'sem acesso' }, 403);
      const obj = await env.PROVAS.get(caminho);
      if (!obj) return json(req, { erro: 'não existe' }, 404);
      return new Response(obj.body, { headers: {
        ...cors(req),
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Length': String(obj.size),
        'Cache-Control': 'private, max-age=604800, immutable',
      } });
    }
    return json(req, { erro: 'método' }, 405);
  },
};

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ARQUIVOS (11/11/2026)
// ═══════════════════════════════════════════════════════════════
// Fotos e arquivos do chat, fotos do corpo e foto de perfil saíram do Supabase
// Storage pra cá, pelo mesmo motivo das provas (tráfego de saída). Ficam num
// balde separado, SEM a limpeza de 120 dias (foto do corpo é pra sempre).
// Caminho: <uid>/<tipo>-<nome>.r2.<ext>, tipo diz quem pode ver:
//   chat / arq → dono, ou quem enxerga a mensagem no banco (RLS do Supabase)
//   corpo      → só o dono
//   avatar     → qualquer um (é a foto que aparece no chat)
// O app pede links ASSINADOS (valem 1 a 2 dias) e usa direto no <img>/<audio>,
// igual fazia com o Supabase; o link fica igual o dia todo, então o navegador
// guarda a imagem em cache.
const ARQ_OK = /^[0-9a-f-]{36}\/(chat|arq|corpo|avatar)-[A-Za-z0-9._-]+\.r2\.[a-z0-9]{1,8}$/;
const ARQ_MAX = 25 * 1024 * 1024;
const DIA = 86400;
const tipoDo = (c) => c.split('/')[1].split('-')[0];
// Tipos que o navegador pode abrir na tela; o resto (e svg, que roda script)
// vai sempre como download.
const ABRE_NA_TELA = /^(image\/(jpeg|png|webp|gif|heic|heif|avif)|audio\/|video\/|application\/pdf$)/;

async function assinatura(env, caminho, exp) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ASSINATURA), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${caminho}:${exp}`));
  return btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function podeVerArquivos(caminhos, quem, env) {
  const ok = new Set();
  const chatDeOutros = [];
  for (const c of caminhos) {
    const t = tipoDo(c);
    if (c.startsWith(quem.id + '/') || t === 'avatar') ok.add(c);
    else if (t === 'chat' || t === 'arq') chatDeOutros.push(c);
  }
  if (chatDeOutros.length) {
    const lista = encodeURIComponent(chatDeOutros.map(c => `"${c}"`).join(','));
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/chat_mensagens?select=imagem_path,arquivo_path&or=(imagem_path.in.(${lista}),arquivo_path.in.(${lista}))`,
      { headers: { Authorization: quem.auth, apikey: env.SUPABASE_KEY } }).catch(() => null);
    const linhas = r?.ok ? await r.json().catch(() => []) : [];
    for (const l of linhas || []) {
      if (chatDeOutros.includes(l.imagem_path)) ok.add(l.imagem_path);
      if (chatDeOutros.includes(l.arquivo_path)) ok.add(l.arquivo_path);
    }
  }
  return ok;
}

async function arquivos(req, env) {
  const url = new URL(req.url);
  const rota = url.pathname.slice(3);   // depois de "/a/"
  if (!env.ASSINATURA) return json(req, { erro: 'sem chave' }, 503);

  // Baixar: link assinado (sem login) ou foto de perfil (pública)
  if (req.method === 'GET' && rota !== 'lista') {
    const caminho = decodeURIComponent(rota);
    if (!ARQ_OK.test(caminho)) return json(req, { erro: 'caminho' }, 400);
    const publico = tipoDo(caminho) === 'avatar';
    if (!publico) {
      const exp = Number(url.searchParams.get('e') || 0);
      if (!exp || exp < Date.now() / 1000) return json(req, { erro: 'link vencido' }, 403);
      if (url.searchParams.get('s') !== await assinatura(env, caminho, exp)) return json(req, { erro: 'assinatura' }, 403);
    }
    const obj = await env.ARQUIVOS.get(caminho);
    if (!obj) return json(req, { erro: 'não existe' }, 404);
    const tipo = obj.httpMetadata?.contentType || 'application/octet-stream';
    return new Response(obj.body, { headers: {
      ...cors(req),
      'Content-Type': tipo,
      'Content-Length': String(obj.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': ABRE_NA_TELA.test(tipo) ? 'inline' : 'attachment',
      'Cache-Control': publico ? 'public, max-age=31536000, immutable' : 'private, max-age=86400',
    } });
  }

  const quem = await quemE(req, env);
  if (!quem) return json(req, { erro: 'precisa estar logado' }, 401);

  // POST /a/assinar { caminhos } → { links: { caminho: url } } só do que pode ver e existe
  if (req.method === 'POST' && rota === 'assinar') {
    const body = await req.json().catch(() => ({}));
    const pedidos = [...new Set((body.caminhos || []).filter(c => ARQ_OK.test(c)))].slice(0, 100);
    const pode = await podeVerArquivos(pedidos, quem, env);
    // vence no fim do dia seguinte (UTC): o link não muda durante o dia
    const exp = (Math.floor(Date.now() / 1000 / DIA) + 2) * DIA;
    const links = {};
    await Promise.all([...pode].map(async c => {
      if (!(await env.ARQUIVOS.head(c))) return;
      const rotaC = c.split('/').map(encodeURIComponent).join('/');
      links[c] = `${url.origin}/a/${rotaC}?e=${exp}&s=${await assinatura(env, c, exp)}`;
    }));
    return json(req, { links });
  }
  // GET /a/lista?tipo=chat → os meus arquivos daquele tipo (faxina do app)
  if (req.method === 'GET' && rota === 'lista') {
    const t = url.searchParams.get('tipo') || '';
    if (!/^(chat|arq|corpo|avatar)$/.test(t)) return json(req, { erro: 'tipo' }, 400);
    const r = await env.ARQUIVOS.list({ prefix: `${quem.id}/${t}-`, limit: 500 });
    return json(req, { arquivos: r.objects.map(o => ({ caminho: o.key, criado: o.uploaded })) });
  }

  const caminho = decodeURIComponent(rota);
  if (!ARQ_OK.test(caminho)) return json(req, { erro: 'caminho' }, 400);
  if (!caminho.startsWith(quem.id + '/')) return json(req, { erro: 'só na própria pasta' }, 403);
  if (req.method === 'PUT') {
    const tam = Number(req.headers.get('Content-Length') || 0);
    if (!tam || tam > ARQ_MAX) return json(req, { erro: 'tamanho' }, 413);
    const tipo = (req.headers.get('Content-Type') || 'application/octet-stream').slice(0, 120);
    if (tipoDo(caminho) !== 'arq' && !/^image\//.test(tipo)) return json(req, { erro: 'tipo' }, 415);
    await env.ARQUIVOS.put(caminho, req.body, { httpMetadata: { contentType: tipo } });
    return json(req, { ok: true, caminho });
  }
  if (req.method === 'DELETE') {
    await env.ARQUIVOS.delete(caminho);
    return json(req, { ok: true });
  }
  return json(req, { erro: 'método' }, 405);
}
