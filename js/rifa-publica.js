// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA da rifa (sem login): grade de números; ocupados marcados;
// escolher um livre → nome + WhatsApp → reserva. Espelha a agenda pública.
// ─────────────────────────────────────────────────────────────
import { getRifa, getNumerosOcupados, escolherNumero } from './rifa-publica-dados.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _tela = inner => `<div class="rf-wrap">${inner}</div>`;
function cleanup() { document.body.classList.remove('rota-publica'); }

let _avisoT = null;
function _aviso(msg) {
  let el = document.querySelector('.ap-toast');
  if (!el) { el = document.createElement('div'); el.className = 'ap-toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_avisoT); _avisoT = setTimeout(() => el.classList.remove('on'), 2600);
}

export async function renderRifaPublica(app, slug) {
  document.body.classList.add('rota-publica');
  document.getElementById('visao-pet')?.classList.add('pet-hidden');
  app.innerHTML = _tela('<div class="ap-load">Carregando rifa…</div>');

  let rifa;
  try { rifa = await getRifa(slug); }
  catch { app.innerHTML = _tela('<div class="ap-erro">Não foi possível carregar esta rifa agora.</div>'); return cleanup; }
  if (!rifa) { app.innerHTML = _tela('<div class="ap-erro">Esta rifa não existe ou está encerrada. 🔒</div>'); return cleanup; }

  const total = rifa.total_numeros || 342;
  let ocupados = new Set();
  try { ocupados = await getNumerosOcupados(slug); } catch {}
  let sel = null;

  function desenhar() {
    const livres = total - ocupados.size;
    app.innerHTML = _tela(`
      <div class="rf-head">
        <div class="rf-titulo">🎟️ ${_esc(rifa.titulo || 'Falcon Rifa')}</div>
        <div class="rf-sub">Escolha seu número da sorte</div>
        <div class="rf-info"><b>${livres}</b> disponíveis · ${ocupados.size} escolhidos</div>
      </div>
      <div class="rf-grid">
        ${Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          return ocupados.has(n)
            ? `<span class="rf-num ocupado" title="Já escolhido">${n}</span>`
            : `<button class="rf-num ${sel === n ? 'sel' : ''}" data-num="${n}" type="button">${n}</button>`;
        }).join('')}
      </div>
      ${sel ? _formHtml(sel) : '<div class="rf-dica">Toque num número livre pra reservar.</div>'}
    `);
    wire();
  }

  function _formHtml(n) {
    return `
      <div class="rf-form">
        <div class="rf-form-res">🎟️ Você escolheu o número <b>${n}</b></div>
        <label class="input-field"><div class="input-field-label">Seu nome</div>
          <input id="rf-nome" placeholder="Nome completo" autocomplete="name"></label>
        <label class="input-field"><div class="input-field-label">Seu WhatsApp</div>
          <input id="rf-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999" autocomplete="tel"></label>
        <button class="btn-primary" id="rf-confirmar" type="button">Reservar número ${n}</button>
      </div>`;
  }

  function wire() {
    app.querySelectorAll('[data-num]').forEach(b => b.addEventListener('click', () => {
      sel = (sel === +b.dataset.num) ? null : +b.dataset.num;
      desenhar();
      const f = app.querySelector('.rf-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const c = app.querySelector('#rf-confirmar');
    if (c) c.addEventListener('click', confirmar);
  }

  async function confirmar() {
    const nome = app.querySelector('#rf-nome')?.value.trim() || '';
    const zap = app.querySelector('#rf-zap')?.value.trim() || '';
    if (nome.length < 2) { _aviso('Escreva seu nome'); return; }
    if (zap.replace(/\D/g, '').length < 8) { _aviso('Escreva um WhatsApp válido'); return; }
    const btn = app.querySelector('#rf-confirmar'); btn.disabled = true; btn.textContent = 'Reservando…';
    const n = sel;
    try {
      await escolherNumero(slug, n, nome, zap);
      ocupados.add(n);
      sel = null;
      app.innerHTML = _tela(`
        <div class="ap-ok">
          <div class="ap-ok-ic">🎟️</div>
          <div class="ap-ok-t">Número ${n} é seu!</div>
          <div class="ap-ok-sub">${_esc(rifa.titulo || 'Falcon Rifa')} · boa sorte! 🍀</div>
          <button class="btn-primary ap-ok-btn" id="rf-voltar" type="button">Ver a rifa</button>
        </div>`);
      app.querySelector('#rf-voltar')?.addEventListener('click', desenhar);
    } catch (e) {
      _aviso(e.message || 'Não deu pra reservar');
      try { ocupados = await getNumerosOcupados(slug); } catch {}
      sel = null; desenhar();
    }
  }

  desenhar();

  // Reatualiza os ocupados ao voltar pra aba (alguém pode ter escolhido enquanto isso).
  const _onVis = async () => {
    if (document.visibilityState !== 'visible') return;
    try { ocupados = await getNumerosOcupados(slug); desenhar(); } catch {}
  };
  document.addEventListener('visibilitychange', _onVis);
  return () => { document.removeEventListener('visibilitychange', _onVis); cleanup(); };
}
