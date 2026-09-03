// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA da rifa (sem login): grade de números; ocupados marcados;
// escolher um livre → nome + WhatsApp → reserva. Espelha a agenda pública.
// ─────────────────────────────────────────────────────────────
import { getRifa, getNumerosOcupados, escolherNumero } from './rifa-publica-dados.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _tela = inner => `<div class="rf-wrap">${inner}</div>`;
const _preco = v => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
const _dataBr = s => { try { const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; } catch { return s; } };
const WA_SVG_RF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';
function _waRifaLink(rifa) {
  let d = String(rifa?.whatsapp || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  const msg = encodeURIComponent(`Olá! Quero participar da ${rifa.titulo || 'rifa'} e escolher meu número 🎟️`);
  return `https://wa.me/${d}?text=${msg}`;
}
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
    const premios = Array.isArray(rifa.premios) ? rifa.premios : [];
    const wa = _waRifaLink(rifa);
    app.innerHTML = _tela(`
      <div class="rf-head">
        <div class="rf-titulo">🎟️ ${_esc(rifa.titulo || 'Falcon Rifa')}</div>
        ${rifa.subtitulo ? `<div class="rf-subt">${_esc(rifa.subtitulo)}</div>` : '<div class="rf-sub">Escolha seu número da sorte</div>'}
        ${rifa.descricao ? `<div class="rf-desc">${_esc(rifa.descricao)}</div>` : ''}
        <div class="rf-badges">
          ${rifa.valor_numero != null ? `<span class="rf-badge">🎟️ R$ ${_preco(rifa.valor_numero)} por número</span>` : ''}
          ${rifa.data_sorteio ? `<span class="rf-badge">📅 Sorteio: ${_dataBr(rifa.data_sorteio)}</span>` : ''}
        </div>
        ${premios.length ? `<div class="rf-premios">
          <div class="rf-premios-t">🏆 Prêmios</div>
          ${premios.map((p, i) => `<div class="rf-premio"><b>${i + 1}º</b> ${_esc(p)}</div>`).join('')}
        </div>` : ''}
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
      ${wa ? `<div class="ap-wa-pro-wrap"><a class="ap-wa-pro" href="${wa}" target="_blank" rel="noopener">${WA_SVG_RF} Me chama no WhatsApp</a></div>` : ''}
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
        ${rifa.valor_numero != null ? `<div class="rf-pgto">Após reservar, combine o pagamento de <b>R$ ${_preco(rifa.valor_numero)}</b> pelo WhatsApp.</div>` : ''}
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
          <div class="ap-ok-t">Número ${n} reservado!</div>
          <div class="ap-ok-sub">${_esc(rifa.titulo || 'Falcon Rifa')}${rifa.valor_numero != null ? ` · combine o pagamento de R$ ${_preco(rifa.valor_numero)} no WhatsApp` : ''} 🍀</div>
          ${_waRifaLink(rifa) ? `<a class="btn-primary ap-ok-btn" href="${_waRifaLink(rifa)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">${WA_SVG_RF} Me chama no WhatsApp</a>` : ''}
          <button class="btn-secondary ap-ok-btn" id="rf-voltar" type="button">Ver a rifa</button>
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
