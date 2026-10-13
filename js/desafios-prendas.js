// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Prenda dos desafios e MURAL DAS PRENDAS (Élton, 13/10)
// Quem é desafiado fica sabendo da prenda ANTES de entrar, e de que ela vai
// pro Mural das Prendas: todo mundo do app vê, por 7 dias, sem download.
// Quem não conclui grava a prenda ao vivo (câmera do Falcon) e ela vai pro
// mural. Banco: migration/desafios-prendas.sql.
// BLOCO 1 — TOPAR A PRENDA ANTES DE ENTRAR
// BLOCO 2 — GRAVAR A PRENDA
// BLOCO 3 — MURAL DAS PRENDAS
// ─────────────────────────────────────────────────────────────
import { fetchPrendas, fetchPrevia, enviarPrenda, assinarProvas } from './desafios.js';
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
        <div class="pr-aceite-prenda"><span>Quem não concluir paga:</span><b>${_esc(prenda)}</b></div>
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

// Vídeo sem download: sem o botão de baixar, sem tela flutuante e sem o
// menu do toque longo. (Print de tela nenhum app consegue impedir.)
export function videoSemDownload(url) {
  return `<video class="pr-video" src="${_esc(url)}" controls playsinline preload="metadata"
            controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture
            disableremoteplayback oncontextmenu="return false"></video>`;
}

export async function abrirMural() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay pr-mural-ov';
  ov.innerHTML = `
    <div class="modal pr-mural">
      <div class="modal-title">🎭 Mural das Prendas</div>
      <div class="modal-hint">Quem não concluiu o desafio paga a prenda aqui. Cada vídeo fica 7 dias e some.</div>
      <div class="pr-lista"><div class="pr-vazio">Carregando…</div></div>
      <button class="btn-secondary" data-pr="fechar" style="width:100%;margin-top:10px">Fechar</button>
    </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-pr="fechar"]').onclick = () => fechar();
  ov.addEventListener('contextmenu', (e) => { if (e.target.closest('video')) e.preventDefault(); });

  const lista = prendasNoAr(await fetchPrendas());
  const urls = await assinarProvas(lista.map(p => p.video_path));
  const el = ov.querySelector('.pr-lista');
  if (!el.isConnected) return;
  el.innerHTML = lista.length ? lista.map(p => `
    <div class="pr-item">
      <div class="pr-item-topo"><b>${_esc(p.nome || 'Falcão')}</b> · <span>${_esc(p.titulo || 'Desafio')}</span></div>
      <div class="pr-item-prenda">🎭 ${_esc(p.prenda || '')}</div>
      ${urls.get(p.video_path) ? videoSemDownload(urls.get(p.video_path)) : '<div class="pr-vazio">Vídeo indisponível</div>'}
      <div class="pr-item-some">⏳ ${_someEm(p)}</div>
    </div>`).join('')
    : '<div class="pr-vazio">Ninguém pagando prenda agora 🦅</div>';
}
