// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — CONFIG
// BLOCO 2 — QUEM É (token do Supabase) E O QUE PODE VER
// BLOCO 3 — HANDLER (enviar, baixar, conferir, listar, apagar)
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
