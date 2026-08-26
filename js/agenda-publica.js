// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA de agendamento (Fase B) — abre pelo link da bio, SEM login.
// Visitante vê os dias/horários livres do dono (via slug) e agenda com
// nome + WhatsApp. Usa só as funções anônimas de agenda.js (RPCs seguras).
// ─────────────────────────────────────────────────────────────
import { getAgendaPublica, getSlotsOcupados, criarAgendamento } from './agenda.js';

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SEM3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _turno = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');

export async function renderAgendaPublica(app, slug) {
  // esconde nav/pet caso o dono abra o link logado dentro do app
  document.body.classList.add('rota-publica');
  document.getElementById('visao-pet')?.classList.add('pet-hidden');

  app.innerHTML = `<div class="ap-wrap"><div class="ap-load">Carregando agenda…</div></div>`;

  let cfg;
  try { cfg = await getAgendaPublica((slug || '').trim()); }
  catch { app.innerHTML = _tela(`<div class="ap-erro">Não foi possível carregar esta agenda agora.</div>`); return cleanup; }
  if (!cfg) { app.innerHTML = _tela(`<div class="ap-erro">Esta agenda não existe ou está desativada. 🔒</div>`); return cleanup; }

  // janela de 30 dias
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ate = new Date(hoje); ate.setDate(ate.getDate() + 30);
  let ocupados = new Set();
  try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}

  // monta os dias com horários livres
  const dias = [];
  for (let i = 0; i < 31; i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i);
    const times = (cfg.disponibilidade?.[String(d.getDay())] || []).slice().sort();
    const livres = times.filter(h => !ocupados.has(`${iso(d)}|${h}`));
    if (livres.length) dias.push({ iso: iso(d), date: d, livres });
  }

  let selDia = dias[0]?.iso || null;
  let selHora = null;

  desenhar();
  return cleanup;

  // ── render principal ──
  function desenhar() {
    if (!dias.length) {
      app.innerHTML = _tela(`
        <div class="ap-head"><div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div></div>
        <div class="ap-vazio">Sem horários disponíveis no momento. 😕<br><small>Volte mais tarde.</small></div>`);
      return;
    }
    const dia = dias.find(x => x.iso === selDia) || dias[0];
    const g = { manha: [], tarde: [], noite: [] };
    dia.livres.forEach(h => g[_turno(h)].push(h));
    const bloco = (lbl, icon, arr) => arr.length ? `
      <div class="ap-turno"><div class="ap-turno-lbl">${icon} ${lbl}</div>
      <div class="ap-slots">${arr.map(h => `<button class="ap-slot ${selHora === h ? 'sel' : ''}" data-hora="${h}" type="button">${h}</button>`).join('')}</div></div>` : '';

    app.innerHTML = _tela(`
      <div class="ap-head">
        <div class="ap-titulo">${_esc(cfg.titulo || 'Agende comigo')}</div>
        <div class="ap-sub">Escolha um horário · ${cfg.duracao_min} min</div>
      </div>
      <div class="ap-dias">
        ${dias.map(x => `<button class="ap-diachip ${x.iso === dia.iso ? 'sel' : ''}" data-dia="${x.iso}" type="button">
          <span class="ap-diachip-dow">${SEM3[x.date.getDay()]}</span>
          <span class="ap-diachip-num">${pad(x.date.getDate())}/${pad(x.date.getMonth() + 1)}</span></button>`).join('')}
      </div>
      <div class="ap-slots-wrap">
        ${bloco('Manhã', '🌅', g.manha) + bloco('Tarde', '☀️', g.tarde) + bloco('Noite', '🌙', g.noite)}
      </div>
      ${selHora ? _formHtml(dia, selHora) : ''}
    `);
    wire(dia);
  }

  function wire(dia) {
    app.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
      selDia = b.dataset.dia; selHora = null; desenhar();
    }));
    app.querySelectorAll('[data-hora]').forEach(b => b.addEventListener('click', () => {
      selHora = (selHora === b.dataset.hora) ? null : b.dataset.hora; desenhar();
      const f = app.querySelector('.ap-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const btn = app.querySelector('#ap-confirmar');
    if (btn) btn.addEventListener('click', () => confirmar(dia));
  }

  function _formHtml(dia, hora) {
    return `
      <div class="ap-form">
        <div class="ap-form-res">📌 ${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)} · <b>${hora}</b></div>
        <label class="input-field"><div class="input-field-label">Seu nome</div>
          <input id="ap-nome" placeholder="Como você se chama?" autocomplete="name"></label>
        <label class="input-field"><div class="input-field-label">Seu WhatsApp</div>
          <input id="ap-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999" autocomplete="tel"></label>
        <button class="btn-primary" id="ap-confirmar" type="button">Confirmar agendamento</button>
      </div>`;
  }

  async function confirmar(dia) {
    const nome = app.querySelector('#ap-nome')?.value.trim() || '';
    const zap = app.querySelector('#ap-zap')?.value.trim() || '';
    if (nome.length < 2) { _aviso('Escreva seu nome'); return; }
    if (zap.replace(/\D/g, '').length < 8) { _aviso('Escreva um WhatsApp válido'); return; }
    const btn = app.querySelector('#ap-confirmar'); btn.disabled = true; btn.textContent = 'Agendando…';
    try {
      await criarAgendamento(cfg.slug, dia.iso, selHora, nome, zap);
      app.innerHTML = _tela(`
        <div class="ap-ok">
          <div class="ap-ok-ic">✅</div>
          <div class="ap-ok-t">Agendamento confirmado!</div>
          <div class="ap-ok-d">${SEM[dia.date.getDay()]}, ${pad(dia.date.getDate())}/${pad(dia.date.getMonth() + 1)} às <b>${selHora}</b></div>
          <div class="ap-ok-sub">${_esc(cfg.titulo || '')}</div>
        </div>`);
    } catch (e) {
      _aviso(e.message || 'Não deu pra agendar');
      // horário pode ter sido pego: recarrega ocupados e volta pra lista
      try { ocupados = await getSlotsOcupados(cfg.slug, iso(hoje), iso(ate)); } catch {}
      selHora = null; desenhar();
    }
  }
}

// wrapper visual + limpeza (remove a classe da rota ao sair)
function _tela(inner) { return `<div class="ap-wrap">${inner}</div>`; }
function cleanup() { document.body.classList.remove('rota-publica'); }

let _avisoT = null;
function _aviso(msg) {
  let el = document.querySelector('.ap-toast');
  if (!el) { el = document.createElement('div'); el.className = 'ap-toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_avisoT); _avisoT = setTimeout(() => el.classList.remove('on'), 2600);
}
