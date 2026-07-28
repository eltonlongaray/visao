// ═══════════════════════════════════════════════════════════════
// FALCON · Coleta de perfil/contato (nome, aniversário, WhatsApp)
// Convite leve, opcional. Cadência: mostra 1x → +7 dias → +7 dias (aviso final).
// O timer conta a partir da ABERTURA de cada mensagem. Nunca duas juntas.
// Finalidades: suporte/acompanhamento · aniversário · comunidade Falcon Hunters.
// ═══════════════════════════════════════════════════════════════
import { getProfile, setProfile } from './banco-dados.js';
import { recordConsent } from './lgpd-consentimentos.js';
import { showToast } from './aviso-tela.js';
import { isAdminPreview } from './avisos.js';

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

// Já preenchido alguma vez? Usado pra decidir se o card de perfil nasce
// aberto (primeira vez, vazio) ou fechado (já preencheu, abre só se tocar).
export function isPerfilDone() {
  return !!_state().done;
}

// Chamado na Home. Decide se e qual convite mostrar, respeitando a cadência.
export async function maybeInvitePerfil() {
  if (_open) return;
  if (document.querySelector('.modal-overlay, .legal-modal-overlay')) return; // não empilha com outro modal

  let perfil = null;
  try { perfil = await getProfile(); } catch { return; }

  // Com "Ver como usuário" ligado, o convite aparece mesmo com o perfil já
  // preenchido: é o único jeito de conferir o comportamento dele sem ter que
  // apagar os próprios dados.
  if (isAdminPreview()) { _show(1, true, perfil); return; }

  const temNome = !!String(perfil?.preferredName || perfil?.fullName || '').trim();

  // SEM NOME: obrigatório e fora da cadência — reaparece toda vez até
  // preencher. Se respeitasse a cadência, quem fechasse o app sem preencher
  // ficaria uma semana sem identidade nas Conversas.
  if (!temNome) { _show(1, true, perfil); return; }

  // COM NOME: o resto (telefone, aniversário) segue opcional e com a cadência
  // original — 1x, +7 dias, +7 dias e nunca mais.
  const s = _state();
  if (s.done) return;
  if (perfil?.phone || perfil?.birthDate) { markPerfilDone(); return; }

  const now = Date.now();
  const stage = s.stage || 0;
  if (stage === 0)      { _show(1, false, perfil); s.stage = 1; s.shownAt = now; _save(s); }
  else if (stage === 1 && now - (s.shownAt || 0) >= WEEK) { _show(2, false, perfil); s.stage = 2; s.shownAt = now; _save(s); }
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

function _show(stage, force = false, perfil = null) {
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
      <label class="input-field"><div class="input-field-label">Como prefere ser chamado(a) <span style="color:var(--red)">*</span></div>
        <input id="pf-apelido" placeholder="Ex: Elton" autocomplete="nickname" /></label>
      <label class="input-field"><div class="input-field-label">Data de nascimento</div>
        <input id="pf-nasc" type="date" /></label>
      <label class="input-field"><div class="input-field-label">WhatsApp (com DDD)</div>
        <input id="pf-wpp" type="tel" inputmode="tel" placeholder="(00) 00000-0000" autocomplete="tel" /></label>

      <div class="modal-hint" style="font-size:12px;margin:8px 2px 2px">
        <strong>*</strong> Só o nome é obrigatório — os outros campos você preenche se quiser.<br><br>
        Ao tocar em <strong>Salvar</strong>, você autoriza o uso desses dados para as finalidades acima. Nada é compartilhado com terceiros — edite ou remova quando quiser em Ajustes.
      </div>

      <div class="modal-hint" id="pf-err" style="color:var(--red);min-height:16px;font-size:12px"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="pf-save" style="width:100%">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Preenche o que a pessoa já tinha salvo: sem isto, quem já tem nome veria
  // os campos vazios e o botão reclamando de um dado que ela já deu.
  if (perfil) {
    const põe = (id, v) => { if (v) overlay.querySelector(id).value = v; };
    põe('#pf-nome',    perfil.fullName);
    põe('#pf-apelido', perfil.preferredName);
    põe('#pf-nasc',    perfil.birthDate);
    põe('#pf-wpp',     perfil.phone);
  }

  const close = () => { overlay.remove(); _open = false; };

  overlay.querySelector('#pf-save').onclick = async () => {
    const full  = overlay.querySelector('#pf-nome').value.trim();
    const nick  = overlay.querySelector('#pf-apelido').value.trim();
    const birth = overlay.querySelector('#pf-nasc').value;      // YYYY-MM-DD ou ''
    const phone = overlay.querySelector('#pf-wpp').value.trim();
    const err = overlay.querySelector('#pf-err');

    // O nome é o único obrigatório: é ele que identifica a pessoa nas
    // Conversas da comunidade. O resto continua opcional.
    if (!nick && !full) {
      err.textContent = 'Preencha como quer ser chamado — é o nome que a comunidade vai ver.';
      overlay.querySelector('#pf-apelido').focus();
      return;
    }

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
