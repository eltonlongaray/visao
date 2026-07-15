// ═══════════════════════════════════════════════════════════════
// FALCON · Coleta de perfil/contato (nome, aniversário, WhatsApp)
// Convite leve, opcional. Cadência: mostra 1x → +7 dias → +7 dias (aviso final).
// O timer conta a partir da ABERTURA de cada mensagem. Nunca duas juntas.
// Finalidades: suporte/acompanhamento · aniversário · comunidade Falcon Hunters.
// ═══════════════════════════════════════════════════════════════
import { getProfile, setProfile } from './banco-dados.js';
import { recordConsent } from './lgpd-consentimentos.js';
import { showToast } from './aviso-tela.js';

const KEY = 'visao_perfil_convite';           // { stage: 0|1|2, done: bool, shownAt: ts }
const WEEK = 7 * 24 * 60 * 60 * 1000;
let _open = false;

function _state() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function _save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

// Marca como concluído (preencheu, aqui ou em Ajustes) — nunca mais convida.
export function markPerfilDone() {
  const s = _state(); s.done = true; _save(s);
}

// Chamado na Home. Decide se e qual convite mostrar, respeitando a cadência.
export async function maybeInvitePerfil() {
  if (_open) return;
  if (document.querySelector('.modal-overlay, .legal-modal-overlay')) return; // não empilha com outro modal
  const s = _state();
  if (s.done) return;

  // Já tem dado preenchido? → conclui e não incomoda.
  try {
    const p = await getProfile();
    if (p && (p.phone || p.fullName || p.preferredName || p.birthDate)) { markPerfilDone(); return; }
  } catch { /* segue */ }

  const now = Date.now();
  const stage = s.stage || 0;

  if (stage === 0)      { _show(1); s.stage = 1; s.shownAt = now; _save(s); }
  else if (stage === 1 && now - (s.shownAt || 0) >= WEEK) { _show(2); s.stage = 2; s.shownAt = now; _save(s); }
  else if (stage === 2 && now - (s.shownAt || 0) >= WEEK) { _show(3); s.done = true; _save(s); }
}

// Reabre o formulário sob demanda (ex: botão em Ajustes) — sem cadência.
export function openPerfilForm() { _show(1, true); }

// ── Conteúdo por etapa ───────────────────────────────────────
function _content(stage) {
  if (stage === 3) return { final: true,
    icon: '🙏', title: 'Obrigado por utilizar o Falcon',
    body: `Não perguntaremos novamente. Mas se um dia quiser receber suporte de perto,
      comemorar seu aniversário com a gente ou entrar para os <strong>Falcon Hunters</strong>,
      é só preencher em <strong>Ajustes → Meu perfil</strong>.<br><br>
      Você é importante para nós — sua presença aqui já faz diferença.` };
  if (stage === 2) return {
    icon: '🦅', title: 'Podemos te conhecer um pouco melhor?',
    intro: `Perguntamos apenas mais esta vez. Deixe seus dados para receber suporte de perto,
      comemorar seu aniversário conosco e entrar para os <strong>Falcon Hunters</strong>.
      Aqui você é livre — e o que deixar fica guardado com sigilo e carinho.`,
    cancel: 'Prefiro não informar' };
  return {
    icon: '🦅', title: 'Que bom ter você no Falcon',
    intro: `Aqui você é livre — não precisa deixar nenhum dado se não quiser. Mas se o fizer,
      garantimos que será muito mais divertido, e guardamos esse sigilo conosco com muito
      respeito e carinho.
      <div class="perfil-benefits">
        <strong>Com esses dados, podemos:</strong>
        <ul>
          <li>Te dar <strong>suporte e acompanhamento</strong> de perto</li>
          <li><strong>Comemorar seu aniversário</strong> com você — você é especial para nós.</li>
          <li>Te <strong>manter informado</strong> sobre a nossa comunidade <strong>Falcon Hunters</strong></li>
        </ul>
      </div>`,
    cancel: 'Agora não' };
}

function _show(stage, force = false) {
  if (_open) return;
  _open = true;
  const c = _content(stage);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  if (c.final) {
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center">
        <div style="font-size:40px;margin-bottom:6px">${c.icon}</div>
        <div class="modal-title">${c.title}</div>
        <div class="modal-hint" style="margin:12px 0 18px">${c.body}</div>
        <div class="modal-actions"><button class="btn-primary" id="pf-ok" style="width:100%">Entendi</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#pf-ok').onclick = () => { overlay.remove(); _open = false; };
    return;
  }

  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div style="font-size:38px;text-align:center;margin-bottom:2px">${c.icon}</div>
      <div class="modal-title" style="text-align:center">${c.title}</div>
      <div class="modal-hint" style="margin-bottom:14px">${c.intro}</div>

      <label class="input-field"><div class="input-field-label">Nome completo</div>
        <input id="pf-nome" placeholder="Seu nome completo" autocomplete="name" /></label>
      <label class="input-field"><div class="input-field-label">Como prefere ser chamado(a)</div>
        <input id="pf-apelido" placeholder="Ex: Elton" autocomplete="nickname" /></label>
      <label class="input-field"><div class="input-field-label">Data de nascimento</div>
        <input id="pf-nasc" type="date" /></label>
      <label class="input-field"><div class="input-field-label">WhatsApp (com DDD)</div>
        <input id="pf-wpp" type="tel" inputmode="tel" placeholder="(00) 00000-0000" autocomplete="tel" /></label>

      <div class="modal-hint" style="font-size:12px;margin:8px 2px 2px">
        Ao tocar em <strong>Salvar</strong>, você autoriza o uso desses dados para as finalidades acima. Nada é compartilhado com terceiros — edite ou remova quando quiser em Ajustes.
      </div>

      <div class="modal-hint" id="pf-err" style="color:var(--red);min-height:16px;font-size:12px"></div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn-primary" id="pf-save" style="width:100%">Salvar</button>
        <button class="btn-secondary" id="pf-cancel" style="width:100%">${c.cancel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); _open = false; };
  overlay.querySelector('#pf-cancel').onclick = close;

  overlay.querySelector('#pf-save').onclick = async () => {
    const full  = overlay.querySelector('#pf-nome').value.trim();
    const nick  = overlay.querySelector('#pf-apelido').value.trim();
    const birth = overlay.querySelector('#pf-nasc').value;      // YYYY-MM-DD ou ''
    const phone = overlay.querySelector('#pf-wpp').value.trim();
    const err = overlay.querySelector('#pf-err');

    if (!full && !nick && !birth && !phone) { err.textContent = 'Preencha ao menos um campo, ou toque em "' + c.cancel + '".'; return; }

    const btn = overlay.querySelector('#pf-save');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      await setProfile({
        ...(full  ? { fullName: full }       : {}),
        ...(nick  ? { preferredName: nick }  : {}),
        ...(birth ? { birthDate: birth }     : {}),
        ...(phone ? { phone }                : {}),
      });
      await recordConsent('perfil_contato_v1', 1);
      markPerfilDone();
      close();
      showToast('✅ Prontinho! Obrigado 🦅', 'success', 5000);
    } catch (e) {
      err.textContent = e.message || 'Não deu pra salvar. Tente de novo.';
      btn.disabled = false; btn.textContent = 'Salvar';
    }
  };
}
