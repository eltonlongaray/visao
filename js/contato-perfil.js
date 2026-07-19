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
    intro: `Preencha seus dados de forma 100% segura, aqui seus dados estão protegidos dentro da lei geral de proteção de dados (LGPD). Eles são necessários para que você tenha a melhor experiência dentro do app.`,
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
        <div class="modal-hint" style="margin:12px 0 18px;font-size:15px;line-height:1.65">${c.body}</div>
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
      <div class="modal-hint" style="margin-bottom:14px;font-size:15px;line-height:1.65">${c.intro}</div>

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

// ═══════════════════════════════════════════════════════════════
// NOME OBRIGATÓRIO
// ═══════════════════════════════════════════════════════════════
// Com o chat da comunidade, ficar sem nome deixou de ser detalhe: a pessoa
// aparece como um código na lista e ninguém sabe com quem está falando.
// Este modal NÃO fecha sem preencher — é o único do app assim, e é de
// propósito.
//
// Aproveita o nome que veio do login do Google como sugestão, então na
// maioria das vezes é só confirmar.
export async function exigirNome() {
  if (_open) return;
  try {
    const p = await getProfile();
    const jaTem = (p?.preferredName || p?.fullName || '').trim();
    if (jaTem) return;
  } catch { return; }   // sem conseguir ler o perfil, não atrapalha o uso

  let sugestao = '';
  try {
    const { supabase } = await import('./config-supabase.js');
    const { data } = await supabase.auth.getUser();
    const meta = data?.user?.user_metadata || {};
    sugestao = (meta.full_name || meta.name || '').trim()
      || (data?.user?.email || '').split('@')[0];
  } catch { /* segue sem sugestão */ }

  _open = true;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div style="font-size:38px;text-align:center;margin-bottom:2px">🦅</div>
      <div class="modal-title" style="text-align:center">Como quer ser chamado?</div>
      <div class="modal-hint" style="margin-bottom:14px;font-size:14px;line-height:1.6">
        É o nome que a comunidade vai ver quando você falar nas
        <strong>Conversas</strong>. Dá pra mudar depois em Ajustes.
      </div>
      <label class="input-field"><div class="input-field-label">Seu nome</div>
        <input id="nm-campo" placeholder="Ex: Elton" autocomplete="nickname"
               maxlength="40" value="${String(sugestao).replace(/"/g, '&quot;')}" /></label>
      <div class="modal-hint" id="nm-err" style="color:var(--red);min-height:16px;font-size:12px"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="nm-ok" style="width:100%">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const campo = overlay.querySelector('#nm-campo');
  const err   = overlay.querySelector('#nm-err');
  const btn   = overlay.querySelector('#nm-ok');
  setTimeout(() => campo.focus(), 120);

  const salvar = async () => {
    const nome = campo.value.trim();
    if (nome.length < 2) { err.textContent = 'Escreva pelo menos 2 letras.'; return; }
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await setProfile({ preferredName: nome });
      overlay.remove(); _open = false;
      showToast(`🦅 Bem-vindo, ${nome}!`, 'success');
    } catch (e) {
      err.textContent = e.message || 'Não deu pra salvar. Tente de novo.';
      btn.disabled = false; btn.textContent = 'Confirmar';
    }
  };
  btn.onclick = salvar;
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
}
