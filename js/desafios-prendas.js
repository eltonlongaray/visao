// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Prenda dos desafios e MURAL DAS PRENDAS (Élton, 13/10)
// Quem é desafiado fica sabendo da prenda ANTES de entrar, e de que ela vai
// pro Mural das Prendas: todo mundo do app vê, por 7 dias, sem download.
// Quem não conclui grava a prenda ao vivo (câmera do Falcon) e ela vai pro
// mural. Banco: migration/desafios-prendas.sql.
// BLOCO 1 — TOPAR A PRENDA ANTES DE ENTRAR
// BLOCO 2 — GRAVAR A PRENDA
// BLOCO 3 — MURAL DAS PRENDAS
// BLOCO 4 — CARROSSEL DO MURAL E TELA CHEIA
// ─────────────────────────────────────────────────────────────
import { fetchPrendas, fetchPrevia, enviarPrenda, urlDaProva, provaGuardada } from './desafios.js';
import { gravarVideoAoVivo } from './desafios-prova.js';
import { AVISO_MURAL } from './desafios-moldes.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_SEG_PRENDA = 120;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: TOPAR A PRENDA ANTES DE ENTRAR
// ═══════════════════════════════════════════════════════════════
// Sem prenda: true direto. Com prenda: mostra a prenda + o aviso do mural e
// só entra se a pessoa topar.
export function aceitarPrenda({ titulo = '', prenda = '' } = {}) {
  if (!String(prenda || '').trim()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal pr-aceite" style="max-width:380px">
        <div class="modal-title">🎭 Topa a prenda?</div>
        ${titulo ? `<div class="pr-aceite-desafio">${_esc(titulo)}</div>` : ''}
        <div class="pr-aceite-prenda"><span>Quem mais falhar paga:</span><b>${_esc(prenda)}</b></div>
        <div class="pr-aceite-mural">📢 ${_esc(AVISO_MURAL)}</div>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" data-pr="sim" style="width:100%">Topo! Entrar no desafio</button>
          <button class="btn-secondary" data-pr="nao" style="width:100%">Agora não</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    let topou = false;
    const fechar = trapModalBack(() => { ov.remove(); resolve(topou); });   // voltar do celular = não
    ov.querySelector('[data-pr="nao"]').onclick = () => fechar();
    ov.querySelector('[data-pr="sim"]').onclick = () => { topou = true; fechar(); };
  });
}

// Entrar pelo código: busca o nome e a prenda primeiro (quem tem o código
// ainda não enxerga o desafio). false = a pessoa não topou.
export async function aceitarPrendaDoCodigo(codigo) {
  const p = await fetchPrevia(codigo);
  if (!p) return true;   // código errado: quem entra devolve o erro certo
  return aceitarPrenda(p);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: GRAVAR A PRENDA
// ═══════════════════════════════════════════════════════════════
// true = foi pro mural
export async function gravarPrenda(d) {
  if (!d?.prenda) return false;
  const blob = await gravarVideoAoVivo({
    titulo: '🎭 Hora da prenda',
    dica: `${_esc(d.prenda)}<br><small>📢 Vai pro Mural das Prendas: todo mundo vê por 7 dias.</small>`,
    maxSeg: MAX_SEG_PRENDA,
    enviarTxt: 'Mandar pro mural',
  });
  if (!blob) return false;
  try {
    showToast('Mandando a prenda pro mural…', 'info');
    await enviarPrenda(d.id, blob);
    showToast('🎭 Prenda paga! Tá no mural por 7 dias 🦅', 'success');
    window.dispatchEvent(new CustomEvent('falcon:prenda', { detail: { desafioId: d.id } }));
    return true;
  } catch (e) {
    showToast(e.message || 'Não deu pra enviar a prenda', 'error');
    return false;
  }
}

// A minha prenda desse desafio (se já paguei)
export function minhaPrenda(prendas, desafioId, uid) {
  return (prendas || []).find(p => p.desafio_id === desafioId && p.user_id === uid) || null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MURAL DAS PRENDAS
// ═══════════════════════════════════════════════════════════════
export const prendasNoAr = (prendas) => (prendas || []).filter(p => new Date(p.expira_em).getTime() > Date.now());

function _someEm(p) {
  const dias = Math.ceil((new Date(p.expira_em).getTime() - Date.now()) / 864e5);
  return dias <= 1 ? 'some amanhã' : `some em ${dias} dias`;
}

// Pet ("mostra o mural das prendas"): abre direto em tela cheia
export async function abrirMural() {
  const lista = prendasNoAr(await fetchPrendas());
  if (!lista.length) { showToast('Ninguém pagando prenda agora 🦅', 'info'); return; }
  abrirPrendaTelaCheia(lista, 0);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CARROSSEL DO MURAL E TELA CHEIA
// ═══════════════════════════════════════════════════════════════
// No topo da aba Desafios, antes dos Oficiais: as prendas no ar passam pro
// lado como carrossel; tocar abre em tela cheia (Élton, 14/10).
export function muralCarrosselHtml(prendas) {
  const lista = prendasNoAr(prendas);
  const cards = lista.length ? lista.map((p, i) => `
      <button type="button" class="pr-card" data-pr-i="${i}" aria-label="Ver a prenda de ${_esc(p.nome || 'Falcão')}">
        <video class="pr-card-video" data-path="${_esc(p.video_path)}" muted playsinline preload="metadata"
               disablepictureinpicture oncontextmenu="return false"></video>
        <span class="pr-card-some">⏳ ${_someEm(p).replace(/^some (em )?/, '')}</span>
        <span class="pr-card-play">▶</span>
        <span class="pr-card-info"><b>${_esc(p.nome || 'Falcão')}</b><small>🎭 ${_esc(p.prenda || '')}</small></span>
      </button>`).join('')
    : `<div class="pr-card-vazio">Ninguém pagando prenda agora 🦅<br><small>Quem mais falhou num desafio aparece aqui, por 7 dias.</small></div>`;
  return `
    <div class="pr-mural-topo">
      <div class="ds-grupo-title">🎭 Mural das Prendas</div>
      <button type="button" class="pr-sugerir" id="ds-sugestoes">💡 Sugerir prenda</button>
    </div>
    <div class="pr-carrossel">${cards}</div>`;
}

// Capa só com o vídeo que já está no celular (baixar só pra capa estourava o
// tráfego do Supabase); o toque abre a tela cheia, que baixa uma vez e guarda.
export async function ligarMuralCarrossel(root, prendas) {
  const lista = prendasNoAr(prendas);
  const box = root.querySelector('.pr-carrossel');
  if (!box || !lista.length) return;
  box.querySelectorAll('[data-pr-i]').forEach(b => b.onclick = () => abrirPrendaTelaCheia(lista, Number(b.dataset.prI)));
  for (const v of box.querySelectorAll('.pr-card-video')) {
    const u = await provaGuardada(v.dataset.path);
    if (u && v.isConnected) v.src = `${u}#t=0.5`;   // #t: mostra um quadro em vez de tela preta
  }
}

// Tela cheia: um vídeo por vez, passa pro lado (arrastar ou ‹ ›), sem download
export function abrirPrendaTelaCheia(lista, i = 0) {
  const ov = document.createElement('div');
  ov.className = 'pr-tela';
  ov.innerHTML = `
    <video class="pr-tela-video" playsinline autoplay controls
           controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture disableremoteplayback></video>
    <div class="pr-tela-topo">
      <div class="pr-tela-info"></div>
      <button type="button" class="pr-tela-fechar" aria-label="Fechar">✕</button>
    </div>
    <button type="button" class="pr-tela-seta pr-ant" aria-label="Anterior">‹</button>
    <button type="button" class="pr-tela-seta pr-prox" aria-label="Próxima">›</button>`;
  document.body.appendChild(ov);
  const video = ov.querySelector('video');
  const fechar = trapModalBack(() => { video.pause(); ov.remove(); });
  ov.addEventListener('contextmenu', (e) => e.preventDefault());
  const mostrar = (n) => {
    i = (n + lista.length) % lista.length;
    const p = lista[i];
    video.removeAttribute('src');
    urlDaProva(p.video_path).then(u => {
      if (lista[i] !== p || !ov.isConnected) return;   // já passou pra outra
      if (!u) { showToast('Não deu pra abrir esse vídeo agora.', 'error'); return; }
      video.src = u;
      video.play().catch(() => {});
    }).catch(() => {});
    ov.querySelector('.pr-tela-info').innerHTML =
      `<b>${_esc(p.nome || 'Falcão')}</b> · <span>${_esc(p.titulo || 'Desafio')}</span><div>🎭 ${_esc(p.prenda || '')}</div><small>⏳ ${_someEm(p)}${lista.length > 1 ? ` · ${i + 1} de ${lista.length}` : ''}</small>`;
    ov.querySelectorAll('.pr-tela-seta').forEach(b => { b.hidden = lista.length < 2; });
  };
  ov.querySelector('.pr-tela-fechar').onclick = () => fechar();
  ov.querySelector('.pr-ant').onclick = () => mostrar(i - 1);
  ov.querySelector('.pr-prox').onclick = () => mostrar(i + 1);
  // Arrastar pro lado passa a prenda
  let x0 = null;
  video.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  video.addEventListener('touchend', (e) => {
    if (x0 == null || lista.length < 2) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) mostrar(i + (dx < 0 ? 1 : -1));
  });
  mostrar(i);
}
