// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Links no chat: clicáveis e com prévia (miniatura + título), igual
// ao WhatsApp. O navegador não lê outro site (CORS): quem busca o título e a
// imagem é o Worker da Cloudflare (cloudflare/pet-ia, campo "previa").
// BLOCO 1 — TEXTO COM LINK CLICÁVEL
// BLOCO 2 — PRÉVIA DO PRIMEIRO LINK
// ─────────────────────────────────────────────────────────────
import { PET_IA_URL } from './pet-nuvem.js';
import { supabase } from './config-supabase.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: TEXTO COM LINK CLICÁVEL
// ═══════════════════════════════════════════════════════════════
const RE_LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Pontuação colada no fim ("olha isso: https://x.com.") não faz parte do link
function _limpa(u) {
  let fim = '';
  while (/[.,!?;:)\]]$/.test(u)) {
    if (u.endsWith(')') && (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length) break;
    fim = u.slice(-1) + fim; u = u.slice(0, -1);
  }
  return [u, fim];
}
const _href = (u) => (/^www\./i.test(u) ? `https://${u}` : u);

// Texto da mensagem já escapado, com os links virando <a>
export function linkificar(texto) {
  const t = String(texto ?? '');
  let out = '', i = 0;
  for (const m of t.matchAll(RE_LINK)) {
    const [u, resto] = _limpa(m[0]);
    out += esc(t.slice(i, m.index));
    out += `<a class="msg-link" href="${esc(_href(u))}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>${esc(resto)}`;
    i = m.index + m[0].length;
  }
  return out + esc(t.slice(i));
}

export function primeiroLink(texto) {
  const m = String(texto ?? '').match(RE_LINK);
  return m ? _href(_limpa(m[0])[0]) : '';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PRÉVIA DO PRIMEIRO LINK
// ═══════════════════════════════════════════════════════════════
// A mensagem leva só um "lugar" pra prévia; hidratarPrevias() preenche depois
// de a lista ir pra tela. Assim o HTML da lista não muda quando a prévia
// chega (a atualização de 12 em 12 s não pisca).
export function blocoPrevia(texto) {
  const u = primeiroLink(texto);
  return u ? `<a class="link-prev" data-prev="${esc(u)}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" hidden></a>` : '';
}

const CACHE_KEY = 'falcon_previas_v1';
const memo = new Map();
const pendentes = new Map();
try { Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')).forEach(([k, v]) => memo.set(k, v)); } catch { /* sem storage */ }
function _guardar(url, p) {
  memo.set(url, p);
  try {
    const obj = Object.fromEntries([...memo].slice(-150));   // só as últimas
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch { /* sem storage */ }
}

async function _buscar(url) {
  if (memo.has(url)) return memo.get(url);
  if (pendentes.has(url)) return pendentes.get(url);
  const pr = (async () => {
    if (!PET_IA_URL) return null;
    try {
      const token = (await supabase.auth.getSession())?.data?.session?.access_token;
      if (!token) return null;
      const r = await fetch(PET_IA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ previa: url }),
      });
      const p = r.ok ? await r.json() : null;
      // Sem título = sem cartão (guarda vazio pra não perguntar de novo)
      const ok = p && p.titulo ? p : { vazio: true };
      _guardar(url, ok);
      return ok;
    } catch { return null; }   // sem rede: tenta de novo na próxima
    finally { pendentes.delete(url); }
  })();
  pendentes.set(url, pr);
  return pr;
}

function _cartao(p) {
  return `
    ${p.imagem ? `<span class="lp-img ${p.video ? 'lp-video' : ''}"><img src="${esc(p.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()" /></span>` : ''}
    <span class="lp-txt">
      <span class="lp-tit">${esc(p.titulo)}</span>
      ${p.descricao ? `<span class="lp-desc">${esc(p.descricao)}</span>` : ''}
      <span class="lp-site">🔗 ${esc(p.site || '')}</span>
    </span>`;
}

// Preenche os lugares de prévia que estão na tela
export function hidratarPrevias(raiz) {
  raiz?.querySelectorAll?.('[data-prev]:not([data-prev-ok])').forEach(async (el) => {
    el.dataset.prevOk = '1';
    const p = await _buscar(el.dataset.prev);
    if (!p || p.vazio || !el.isConnected) { if (!p) delete el.dataset.prevOk; return; }
    el.innerHTML = _cartao(p);
    el.hidden = false;
  });
}
