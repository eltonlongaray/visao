// ═══════════════════════════════════════════════════════════════
// FALCON · Tela de Ajustes
// Topo: ações rápidas (opção única, botões fixos).
// Abaixo: grupos retráteis (accordion) com "Toque para abrir".
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — RENDER
// BLOCO 2 — WIRES
// BLOCO 3 — HELPERS
// ─────────────────────────────────────────────────────────────
import { auth, signOut } from '../autenticacao.js';
import { navigate } from '../roteador.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import * as biometric from '../biometria.js';
import { downloadJson, openPdfReport } from '../exportar-dados.js';
import { deleteMyAccount } from '../excluir-conta.js';
import { getProfile, setProfile } from '../banco-dados.js';
import { submitFeedback } from '../feedback.js';
import { recordConsent } from '../lgpd-consentimentos.js';
import { markPerfilDone, isPerfilDone } from '../contato-perfil.js';
import { trocarMinhaFoto, removerMinhaFoto } from '../chat.js';
import { isAdminPreview, setAdminPreview, resetAvisosRead } from '../avisos.js';
import { resetDesafiosSeen } from '../desafios.js';
import { playDelete } from '../sons.js';
import * as tour from '../tour-guiado.js';
import { bottomNav } from '../components/menu-inferior.js';
import { t } from '../idioma.js';
import { canInstallApp, promptInstallApp } from '../notificacoes.js';
import { subscribeToPush, notifSupported, permissionStatus, getNotifMuted, setNotifMuted, showNotifPopupGuide } from '../notificacoes.js';

const WORKER_URL     = 'https://visao-push-worker.eltonvisao.workers.dev';
const WORKER_API_KEY = 'yL1qvOpajATNWrhB2l8ZutoRPU6MJ4QmCeIFY9n0';

// Row de ação direta (botão clicável)
const row = (id, title, sub, { danger = false } = {}) => `
  <button class="ajustes-row clickable ${danger ? 'danger' : ''}" id="${id}">
    <div class="ajustes-row-main">
      <div class="ajustes-row-title">${title}</div>
      ${sub ? `<div class="ajustes-row-sub"${sub.id ? ` id="${sub.id}"` : ''}>${sub.text ?? sub}</div>` : ''}
    </div>
    <span class="ajustes-row-arrow">›</span>
  </button>`;

// Seção retrátil: o cabeçalho tem cara de card clicável + "Toque para abrir".
// { open: true } já nasce aberta (ex: Meu perfil).
function acc(titleHtml, bodyHtml, { open = false, id = '' } = {}) {
  return `
    <section class="ajustes-acc${open ? ' open' : ''}"${id ? ` id="${id}"` : ''}>
      <button type="button" class="ajustes-row clickable ajustes-acc-head">
        <div class="ajustes-row-main">
          <div class="ajustes-row-title">${titleHtml}</div>
        </div>
        <span class="ajustes-acc-cta">
          <span class="ajustes-acc-hint">Toque para abrir</span>
          <span class="ajustes-row-arrow ajustes-acc-chev">▾</span>
        </span>
      </button>
      <div class="ajustes-acc-body"${open ? '' : ' hidden'}>${bodyHtml}</div>
    </section>`;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderAjustes(app) {
  const user = auth.currentUser;
  const email = user?.email || '—';

  // Perfil (pra saber se é admin — habilita a seção "Ver como usuário")
  let isAdmin = false;
  try { isAdmin = !!(await getProfile())?.isAdmin; } catch { /* segue */ }

  const adminSection = isAdmin ? `
        <section class="ajustes-section ajustes-admin-section">
          <div class="ajustes-section-title">🛡️ Admin</div>
          <div class="ajustes-row" id="rowAdminPreview">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">👁 Ver como usuário</div>
              <div class="ajustes-row-sub">Enxergue os Avisos como um usuário comum (sem compositor nem edição).</div>
            </div>
            <label class="ajustes-toggle"><input type="checkbox" id="adminPreviewToggle"><span class="ajustes-toggle-slider"></span></label>
          </div>
        </section>` : '';

  app.innerHTML = `
    <div class="ajustes-screen">
      <div class="ajustes-content">
        <div class="screen-title">
          <h1>${t('ajustes.title')}</h1>
          <div class="sub">${t('ajustes.sub')}</div>
        </div>

        <div class="ajustes-account">
          <div class="ajustes-avatar" style="background:#4f46e5"><img src="icons/icon-192.png?v=95" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;"></div>
          <div class="ajustes-account-info">
            <strong>${escape(email)}</strong>
            <small>${t('ajustes.plan')}</small>
          </div>
        </div>

        ${adminSection}

        <!-- Grupos retráteis (topo) -->
        <div class="ajustes-instalar" id="ajustesInstalar" hidden>
          <div class="ajustes-instalar-txt">
            <strong>📲 Instalar o Falcon</strong>
            <span>Vira ícone na sua tela inicial, abre sem barra de navegador e recebe os lembretes com mais confiança.</span>
          </div>
          <button class="btn-primary" id="btnInstalarApp">Instalar</button>
        </div>

        ${acc('👤 Meu perfil', `
          <div class="perf-foto-row">
            <span class="perf-foto-wrap">
              <img id="perfFoto" class="perf-foto" alt="" referrerpolicy="no-referrer" hidden />
              <span id="perfFotoVazia" class="perf-foto-vazia">🦅</span>
            </span>
            <div class="perf-foto-acoes">
              <div class="perf-foto-tit">Sua foto</div>
              <div class="perf-foto-sub">É ela que aparece nas conversas da comunidade.</div>
              <div class="perf-foto-btns">
                <button class="btn-secondary" id="perfFotoTrocar" type="button">Escolher foto</button>
                <button class="btn-secondary" id="perfFotoRemover" type="button" hidden>Remover</button>
              </div>
            </div>
            <input type="file" id="perfFotoArq" accept="image/*" hidden />
          </div>
          <label class="input-field" style="margin-top:6px"><div class="input-field-label">Nome completo</div>
            <input id="perfNome" placeholder="Seu nome completo" autocomplete="name" /></label>
          <label class="input-field"><div class="input-field-label">Como prefere ser chamado(a)</div>
            <input id="perfApelido" placeholder="" autocomplete="nickname" /></label>
          <label class="input-field"><div class="input-field-label">Data de nascimento</div>
            <input id="perfNasc" type="date" /></label>
          <label class="input-field"><div class="input-field-label">WhatsApp (com DDD)</div>
            <input id="perfWpp" type="tel" inputmode="tel" placeholder="(00) 00000-0000" autocomplete="tel" /></label>
          <div class="ajustes-row-sub" style="padding:8px 12px 2px;font-size:12px;line-height:1.5">
            <strong>Esses dados são importantes para:</strong><br>
            • Suporte, acompanhamento personalizado e atualizações referente a comunidade Falcon Hunters.<br><br>
            Ao salvar, você autoriza o uso desses dados para as finalidades acima com a garantia de segurança exigida pela LGPD, e pode remover seus dados quando quiser.
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;padding:6px 12px 4px">
            <button class="btn-primary" id="perfSave">Salvar</button>
            <button class="btn-secondary" id="perfRemove" style="color:var(--red)">Remover meus dados</button>
          </div>
        `, { open: !isPerfilDone(), id: 'accPerfil' })}

        ${acc('💬 Sugerir melhoria', `
          <div class="ajustes-row-sub" style="padding:10px 12px 6px">
            Tem uma ideia pra deixar o Falcon melhor? Escreva aqui — sua opinião é o que nos guia. 🦅
          </div>
          <div style="padding:0 12px 8px">
            <textarea id="fbMsg" rows="4" placeholder="Sua sugestão de melhoria..." style="width:100%;box-sizing:border-box;border-radius:12px;border:1px solid var(--border,#3a3a4a);background:var(--input-bg,rgba(255,255,255,.04));color:inherit;padding:10px 12px;font:inherit;resize:vertical"></textarea>
            <button class="btn-primary" id="fbSend" style="width:100%;margin-top:8px">Enviar sugestão</button>
          </div>
        `, { id: 'accSugestao' })}

        ${acc('🔔 Notificações', `
          <div class="ajustes-row" id="rowMuteNotif">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.notif.mute')}</div>
              <div class="ajustes-row-sub">${t('ajustes.notif.mute.sub')}</div>
            </div>
            <label class="ajustes-toggle"><input type="checkbox" id="muteNotifToggle"><span class="ajustes-toggle-slider"></span></label>
          </div>
          ${row('testPushBtn', t('ajustes.notif.test'), { id: 'testPushSub', text: t('ajustes.notif.test.sub') })}
          ${row('notifGuideBtn', 'Notificações não estão chegando?', 'Toque para ver como ativar som, vibração e pop-up')}
        `, { id: 'accNotif' })}

        ${acc(t('ajustes.data'), `
          ${row('exportJsonBtn', t('ajustes.json.title'), t('ajustes.json.sub'))}
          ${row('exportPdfBtn', t('ajustes.pdf.title'), t('ajustes.pdf.sub'))}
        `, { id: 'accDados' })}

        ${acc(t('ajustes.legal'), `
          <button class="ajustes-row clickable" data-route="/termos">
            <div class="ajustes-row-main"><div class="ajustes-row-title">${t('ajustes.terms.title')}</div></div>
            <span class="ajustes-row-arrow">›</span>
          </button>
          <button class="ajustes-row clickable" data-route="/privacidade">
            <div class="ajustes-row-main"><div class="ajustes-row-title">${t('ajustes.privacy.title')}</div></div>
            <span class="ajustes-row-arrow">›</span>
          </button>
        `, { id: 'accLegal' })}

        <!-- Ações rápidas (fixas — cada uma tem só uma opção) -->
        <section class="ajustes-section">
          ${row('restartTourBtn', t('ajustes.tutorial.title'), t('ajustes.tutorial.sub'))}
          ${row('trocarModalidadeBtn', t('ajustes.modal.change'), t('ajustes.modal.sub'))}
          <div class="ajustes-row" id="rowBio">
            <div class="ajustes-row-main">
              <div class="ajustes-row-title">${t('ajustes.bio.title')}</div>
              <div class="ajustes-row-sub">${t('ajustes.bio.sub')}</div>
            </div>
            <label class="ajustes-toggle"><input type="checkbox" id="bioToggle"><span class="ajustes-toggle-slider"></span></label>
          </div>
          ${row('forceUpdateBtn', t('ajustes.update.title'), t('ajustes.update.sub'))}
        </section>

        <!-- Conta (retrátil, no fim de tudo) -->
        ${acc(t('ajustes.account'), `
          ${row('signOutBtn', t('ajustes.signout'), t('ajustes.signout.sub'))}
          ${row('deleteAccountBtn', t('ajustes.delete.title'), t('ajustes.delete.sub'), { danger: true })}
        `, { id: 'accConta' })}

        <div class="ajustes-version">
          Falcon · v1.0.0 · build ${window.__BUILD || '?'}<br>
          Desenvolvido por Élton Longaray
        </div>
      </div>
      ${bottomNav('ajustes')}
    </div>
  `;

  await wire(app);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIRES
// ═══════════════════════════════════════════════════════════════
async function wire(app) {
  // ── Accordion: abre/fecha ──
  app.querySelectorAll('.ajustes-acc-head').forEach(head => {
    head.addEventListener('click', () => {
      const sec = head.closest('.ajustes-acc');
      const body = sec.querySelector('.ajustes-acc-body');
      const open = !sec.classList.contains('open');
      sec.classList.toggle('open', open);
      body.hidden = !open;
    });
  });

  app.querySelectorAll('[data-route]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route))
  );
  app.querySelector('#trocarModalidadeBtn')?.addEventListener('click', () => navigate('/modalidade'));

  // ── Admin: "Ver como usuário" ──
  const admPrev = app.querySelector('#adminPreviewToggle');
  if (admPrev) {
    admPrev.checked = isAdminPreview();
    admPrev.addEventListener('change', () => {
      setAdminPreview(admPrev.checked);
      if (admPrev.checked) { resetAvisosRead(); resetDesafiosSeen(); }   // revive as bolinhas p/ ver o fluxo de um usuário novo
      showToast(admPrev.checked
        ? '👁 Vendo como usuário — volte à Home: a bolinha vai estar nos Avisos'
        : '🛡️ De volta à visão de admin', 'info');
    });
  }

  // ── Meu perfil ──
  // true = a pessoa subiu uma foto; false = está valendo a do Google (ou
  // nenhuma). Só no primeiro caso faz sentido oferecer "Remover".
  let fotoPropria = false;

  (async () => {
    try {
      const p = await getProfile();
      if (p) {
        app.querySelector('#perfNome').value    = p.fullName || '';
        app.querySelector('#perfApelido').value = p.preferredName || '';
        app.querySelector('#perfNasc').value    = p.birthDate || '';
        app.querySelector('#perfWpp').value     = p.phone || '';
      }
      fotoPropria = !!p?.fotoUrl;
      mostrarFoto(p?.fotoUrl || auth.currentUser?.photoURL || null);
    } catch (e) { console.warn('[ajustes] load perfil:', e); }
  })();

  // ── Instalar o app ──
  // Só aparece quando REALMENTE dá pra instalar: o navegador precisa ter
  // disparado o beforeinstallprompt, e não pode já estar instalado. Um botão
  // que não instala nada é pior que nenhum botão.
  (() => {
    const caixa = app.querySelector('#ajustesInstalar');
    const btn = app.querySelector('#btnInstalarApp');
    if (!caixa || !btn) return;
    caixa.hidden = !canInstallApp();
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Abrindo…';
      const r = await promptInstallApp();
      if (r === 'accepted') { caixa.hidden = true; showToast('✅ Instalando o Falcon!', 'success'); }
      else { btn.disabled = false; btn.textContent = 'Instalar'; }
    });
  })();

  // ── Foto de perfil ──
  // A imagem é reduzida AQUI, antes de subir: a câmera do celular entrega
  // arquivos de vários MB e um avatar de 36px na tela não precisa de nada
  // além de 256. Isso também mantém o upload dentro do limite do bucket.
  const FOTO_LADO = 256;

  function mostrarFoto(url) {
    const img = app.querySelector('#perfFoto');
    const vazia = app.querySelector('#perfFotoVazia');
    const rem = app.querySelector('#perfFotoRemover');
    if (!img) return;
    if (url) { img.src = url; img.hidden = false; if (vazia) vazia.hidden = true; }
    else { img.removeAttribute('src'); img.hidden = true; if (vazia) vazia.hidden = false; }
    // "Remover" só faz sentido sobre uma foto ESCOLHIDA por ela. Sobre a do
    // Google não haveria o que remover — aquela vem do login.
    if (rem) rem.hidden = !fotoPropria;
  }

  // Corta no quadrado central e reduz. Recortar antes de encolher evita o
  // rosto achatado quando a foto é bem retangular.
  function reduzir(arquivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const lado = Math.min(im.width, im.height);
        const cv = document.createElement('canvas');
        cv.width = cv.height = FOTO_LADO;
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, (im.width - lado) / 2, (im.height - lado) / 2, lado, lado,
                      0, 0, FOTO_LADO, FOTO_LADO);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('Não deu pra processar a imagem')),
                  'image/jpeg', 0.85);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Arquivo de imagem inválido')); };
      im.src = url;
    });
  }

  app.querySelector('#perfFotoTrocar')?.addEventListener('click', () => {
    app.querySelector('#perfFotoArq')?.click();
  });

  app.querySelector('#perfFotoArq')?.addEventListener('change', async (ev) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';   // permite reescolher o MESMO arquivo depois
    if (!arquivo) return;
    const btn = app.querySelector('#perfFotoTrocar');
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const url = await trocarMinhaFoto(await reduzir(arquivo));
      fotoPropria = true;
      mostrarFoto(url);
      showToast('✅ Foto atualizada!', 'success');
    } catch (e) { showToast('Erro ao enviar: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Escolher foto'; }
  });

  app.querySelector('#perfFotoRemover')?.addEventListener('click', async () => {
    try {
      await removerMinhaFoto();
      fotoPropria = false;
      // Sem foto própria, volta a valer a do Google (se a pessoa entrou por lá).
      mostrarFoto(auth.currentUser?.photoURL || null);
      showToast('Foto removida.', 'info');
    } catch (e) { showToast('Erro ao remover: ' + e.message, 'error'); }
  });

  app.querySelector('#perfSave')?.addEventListener('click', async () => {
    const btn = app.querySelector('#perfSave');
    const full  = app.querySelector('#perfNome').value.trim();
    const nick  = app.querySelector('#perfApelido').value.trim();
    const birth = app.querySelector('#perfNasc').value;
    const phone = app.querySelector('#perfWpp').value.trim();
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      await setProfile({ fullName: full || null, preferredName: nick || null, birthDate: birth || null, phone: phone || null });
      if (full || nick || birth || phone) await recordConsent('perfil_contato_v1', 1);
      markPerfilDone();
      showToast('✅ Perfil salvo!', 'success');
    } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Salvar'; }
  });

  app.querySelector('#perfRemove')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Remover seus dados de contato?', message: 'Nome, data de nascimento e WhatsApp serão apagados. Você pode preencher de novo quando quiser.', confirmText: 'Remover', cancelText: 'Cancelar', danger: true });
    if (!ok) return;
    try {
      await setProfile({ fullName: null, preferredName: null, birthDate: null, phone: null });
      ['#perfNome', '#perfApelido', '#perfNasc', '#perfWpp'].forEach(s => { app.querySelector(s).value = ''; });
      markPerfilDone();
      showToast('Dados removidos.', 'info');
    } catch (e) { showToast('Erro ao remover: ' + e.message, 'error'); }
  });

  // ── Sugerir melhoria ──
  app.querySelector('#fbSend')?.addEventListener('click', async () => {
    const ta = app.querySelector('#fbMsg');
    const btn = app.querySelector('#fbSend');
    const msg = ta.value.trim();
    if (!msg) { showToast('Escreva sua sugestão antes de enviar.', 'info'); return; }
    btn.disabled = true; btn.textContent = 'Enviando...';
    try { await submitFeedback(msg); ta.value = ''; showToast('🦅 Recebido! Obrigado pela sugestão.', 'success', 5000); }
    catch (e) { showToast('Erro ao enviar: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Enviar sugestão'; }
  });

  // ── Bio toggle ──
  const bioToggle = app.querySelector('#bioToggle');
  const bioAvailable = await biometric.isAvailable();
  bioToggle.checked = biometric.isEnabled();
  bioToggle.disabled = !bioAvailable;
  if (!bioAvailable) {
    app.querySelector('#rowBio .ajustes-row-sub').textContent = 'Seu celular não tem desbloqueio configurado.';
  }
  bioToggle.addEventListener('change', async () => {
    if (bioToggle.checked) {
      bioToggle.disabled = true;
      try {
        const user = auth.currentUser;
        await biometric.register(user.uid, user.email || 'Falcon');
        showToast('Bloqueio biométrico ativado.', 'success');
      } catch (err) {
        console.warn('[ajustes] bio enable falhou:', err);
        bioToggle.checked = false;
        showToast(err?.name === 'NotAllowedError' ? 'Cancelado.' : 'Não foi possível ativar.', 'error');
      } finally { bioToggle.disabled = false; }
    } else {
      biometric.disable();
      showToast('Bloqueio biométrico desativado.', 'info');
    }
  });

  // ── Mute notificações ──
  const muteToggle = app.querySelector('#muteNotifToggle');
  if (muteToggle) {
    muteToggle.checked = getNotifMuted();
    muteToggle.addEventListener('change', () => {
      setNotifMuted(muteToggle.checked);
      showToast(muteToggle.checked ? 'Notificações silenciadas' : 'Som de notificações ativado', 'info');
    });
  }

  // ── Export JSON ──
  app.querySelector('#exportJsonBtn')?.addEventListener('click', async () => {
    const sub = app.querySelector('#exportJsonBtn .ajustes-row-sub');
    const original = sub.textContent;
    sub.textContent = 'Coletando seus dados...';
    try { await downloadJson(); sub.textContent = 'Download iniciado!'; setTimeout(() => sub.textContent = original, 2200); }
    catch (err) { console.error('[ajustes] export json:', err); showToast('Erro ao exportar. Tente novamente.', 'error'); sub.textContent = original; }
  });

  // ── Relatório PDF ──
  app.querySelector('#exportPdfBtn')?.addEventListener('click', async () => {
    const sub = app.querySelector('#exportPdfBtn .ajustes-row-sub');
    const original = sub.textContent;
    sub.textContent = 'Montando relatório...';
    try { await openPdfReport(); sub.textContent = 'Abriu numa nova aba!'; setTimeout(() => sub.textContent = original, 2400); }
    catch (err) {
      console.error('[ajustes] export pdf:', err);
      showToast((err?.message || '').includes('popup') ? 'Permita pop-ups pro app gerar o PDF.' : 'Erro ao gerar relatório.', 'error');
      sub.textContent = original;
    }
  });

  // ── Reiniciar tour ──
  app.querySelector('#restartTourBtn')?.addEventListener('click', async () => {
    tour.reset();
    showToast('Iniciando tutorial...', 'success');
    navigate('/home');
    const { ONBOARDING_STEPS } = await import('../config-tour.js');
    setTimeout(() => tour.start(ONBOARDING_STEPS), 700);
  });

  // ── Forçar atualização ──
  app.querySelector('#forceUpdateBtn')?.addEventListener('click', async () => {
    const btn = app.querySelector('#forceUpdateBtn');
    const sub = btn.querySelector('.ajustes-row-sub');
    sub.textContent = t('ajustes.update.clearing');
    btn.disabled = true;
    try {
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
      localStorage.removeItem('_visao_build');
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
      }
      sub.textContent = t('ajustes.update.restart');
      window.location.reload(true);
    } catch (err) { console.error('[ajustes] forceUpdate:', err); sub.textContent = t('ajustes.update.err'); btn.disabled = false; }
  });

  // ── Testar push ──
  app.querySelector('#testPushBtn')?.addEventListener('click', async () => {
    const btn = app.querySelector('#testPushBtn');
    const sub = app.querySelector('#testPushSub');
    btn.disabled = true;
    if (!notifSupported())              { sub.textContent = t('ajustes.push.unsupported'); btn.disabled = false; return; }
    if (permissionStatus() !== 'granted') { sub.textContent = t('ajustes.push.denied'); btn.disabled = false; return; }
    const userId = auth.currentUser?.uid;
    if (!userId) { sub.textContent = '❌ Usuário não autenticado.'; btn.disabled = false; return; }

    sub.textContent = '📤 Enviando... MINIMIZE o app AGORA — vai tocar em ~2s';
    try {
      const res = await fetch(`${WORKER_URL}/test-push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
        body: JSON.stringify({ userId, delaySec: 2 }),
      });
      const data = await res.json();
      if (data.ok) {
        sub.textContent = data.delayed ? '⏱️ Vai tocar em ~2s — minimize o app pra testar em segundo plano' : t('ajustes.push.sent', { status: data.status });
        showToast('📤 Push a caminho — minimize o app!', 'success');
      } else if (data.error === 'no_subscription') {
        sub.textContent = 'Registrando... tentando novamente';
        await subscribeToPush();
        const res2 = await fetch(`${WORKER_URL}/test-push`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
          body: JSON.stringify({ userId, delaySec: 2 }),
        });
        const data2 = await res2.json();
        sub.textContent = data2.ok ? '⏱️ Registrado! Vai tocar em ~2s — minimize o app' : t('ajustes.push.no_sub');
        showToast(data2.ok ? '📤 Push a caminho — minimize o app!' : t('ajustes.push.no_sub.toast'), data2.ok ? 'success' : 'info');
      } else if (data.error === 'subscription_stale') {
        sub.textContent = t('ajustes.push.stale'); await subscribeToPush(); showToast(t('ajustes.push.stale.toast'), 'info');
      } else {
        sub.textContent = t('ajustes.push.err', { msg: data.error || data.status || '?' }); showToast(t('ajustes.push.err.toast'), 'error');
      }
    } catch (err) { sub.textContent = t('ajustes.push.network', { msg: err.message }); showToast(t('ajustes.push.no_conn'), 'error'); }
    btn.disabled = false;
  });

  // ── Guia de pop-up + vibração ──
  app.querySelector('#notifGuideBtn')?.addEventListener('click', () => showNotifPopupGuide(true));

  // ── Sair ──
  app.querySelector('#signOutBtn')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Sair da conta?', message: 'Você precisará fazer login de novo. Seus dados continuam salvos.', confirmText: 'Sair', cancelText: 'Cancelar' });
    if (!ok) return;
    try { await signOut(auth); navigate('/login'); }
    catch (err) { console.error('[ajustes] signOut:', err); showToast('Erro ao sair.', 'error'); }
  });

  // ── Excluir conta ──
  app.querySelector('#deleteAccountBtn')?.addEventListener('click', async () => {
    const ok1 = await confirmModal({ title: '⚠️ Excluir conta?', message: 'TODOS os seus dados (atividades, ritual, reflexões, sono, hidratação) serão APAGADOS PARA SEMPRE. Esta ação não pode ser desfeita.', confirmText: 'Continuar', cancelText: 'Cancelar', danger: true });
    if (!ok1) return;
    const ok2 = await confirmModal({ title: 'Tem certeza absoluta?', message: 'Última chance. Após confirmar, sua conta e seus dados serão eliminados imediatamente.', confirmText: 'Sim, excluir tudo', cancelText: 'Voltar', danger: true });
    if (!ok2) return;

    playDelete();
    const btn = app.querySelector('#deleteAccountBtn');
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
      const result = await deleteMyAccount();
      if (result.auth === 'requires-recent-login') {
        showToast('Por segurança, faça login de novo pra concluir.', 'info');
        try { await signOut(auth); } catch {}
        navigate('/login'); return;
      }
      showToast('Conta excluída com sucesso. Até logo!', 'success');
      try { await signOut(auth); } catch {}
      navigate('/login');
    } catch (err) {
      console.error('[ajustes] delete account:', err);
      showToast('Erro ao excluir. Tente novamente em alguns minutos.', 'error');
      btn.disabled = false; btn.style.opacity = '1';
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: HELPERS
// ═══════════════════════════════════════════════════════════════
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
