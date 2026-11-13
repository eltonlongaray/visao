// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — CONFIG E CHAMADA AO WORKER
// BLOCO 2 — ENVIAR, ASSINAR, LISTAR, APAGAR
// ─────────────────────────────────────────────────────────────
// Fotos e arquivos no Cloudflare R2 (11/11/2026): fotos do chat, arquivos e
// áudios do chat, fotos do corpo e foto de perfil. O Supabase cobra o tráfego
// de saída acima de 5 GB/mês; o R2 não cobra. Mesmo Worker das provas
// (cloudflare/provas, rotas /a/...). Caminho: <uid>/<tipo>-<nome>.r2.<ext>.
// Arquivo antigo (sem ".r2") continua no Supabase e abre como antes.
import { supabase } from './config-supabase.js';

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CONFIG E CHAMADA AO WORKER
// ═══════════════════════════════════════════════════════════════
export const R2_URL = 'https://falcon-provas.eltonvisao.workers.dev';
export const ehR2 = (caminho) => /\.r2\.[a-z0-9]+$/i.test(caminho || '');

async function chamar(metodo, rota, corpo, tipo) {
  const token = (await supabase.auth.getSession())?.data?.session?.access_token;
  if (!token) throw new Error('Sessão expirada');
  const headers = { Authorization: `Bearer ${token}` };
  if (tipo) headers['Content-Type'] = tipo;
  const r = await fetch(`${R2_URL}${rota}`, { method: metodo, headers, body: corpo });
  if (!r.ok) throw new Error(`R2 ${r.status}`);
  return r;
}
const rotaDe = (caminho) => `/a/${caminho.split('/').map(encodeURIComponent).join('/')}`;

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ENVIAR, ASSINAR, LISTAR, APAGAR
// ═══════════════════════════════════════════════════════════════
// tipo: chat | arq | corpo | avatar. ext com ponto (".jpg"). Devolve o caminho
// ou lança erro (quem chama decide se cai pro Supabase).
export async function subirR2(uid, tipo, blob, ext, mime) {
  const e = /^\.[a-z0-9]{1,8}$/i.test(ext || '') ? ext.toLowerCase() : '.bin';
  const caminho = `${uid}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.r2${e}`;
  await chamar('PUT', rotaDe(caminho), blob, mime || blob.type || 'application/octet-stream');
  return caminho;
}

// Link de foto de perfil: público e fixo (o nome muda a cada troca).
export const urlPublicaR2 = (caminho) => `${R2_URL}${rotaDe(caminho)}`;

// Map caminho → link assinado (só do que existe e a pessoa pode ver).
export async function assinarR2(caminhos) {
  const r2 = [...new Set((caminhos || []).filter(ehR2))];
  const mapa = new Map();
  for (let i = 0; i < r2.length; i += 100) {
    try {
      const { links = {} } = await (await chamar('POST', '/a/assinar', JSON.stringify({ caminhos: r2.slice(i, i + 100) }), 'application/json')).json();
      Object.entries(links).forEach(([c, u]) => mapa.set(c, u));
    } catch (e) { console.warn('[Falcon] assinarR2:', e.message); }
  }
  return mapa;
}

export async function listarR2(tipo) {
  try {
    const { arquivos = [] } = await (await chamar('GET', `/a/lista?tipo=${tipo}`)).json();
    return arquivos;
  } catch { return []; }
}

export async function apagarR2(caminhos) {
  await Promise.all((caminhos || []).filter(ehR2).map(c => chamar('DELETE', rotaDe(c)).catch(() => {})));
}
