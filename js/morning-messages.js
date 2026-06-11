// ═══════════════════════════════════════════════════════════════
// VISÃO · Mensagens da manhã
// Só a mensagem 3 tem anotações (com placeholder + auto-save).
// Botões: ‹ Anterior · Próxima › / Fechar
// "Fechar" na última encerra TUDO (não volta pra lista).
// NÃO fecha ao clicar fora.
//
// Notas são salvas em DOIS lugares:
//   • Firestore (profile.morningNotes) — persiste mesmo limpando navegador
//   • localStorage (cache rápido) — pra abrir sem esperar Firestore
// ═══════════════════════════════════════════════════════════════
import { trapModalBack } from './modal-back.js';
import { getProfile, setProfile } from './store.js';

const STORAGE_LAST_READ = 'visao_msgs_last_read_day';
const STORAGE_NOTE_PREFIX = 'visao_msg_note_';

// Cache em memória das notas (preenchido pela 1a leitura)
let notesCache = null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hasUnreadToday() {
  return localStorage.getItem(STORAGE_LAST_READ) !== todayKey();
}

function markReadToday() {
  localStorage.setItem(STORAGE_LAST_READ, todayKey());
}

// Lê do cache em memória → senão localStorage
function getNoteLocal(n) {
  if (notesCache && notesCache[n] != null) return notesCache[n];
  try {
    return localStorage.getItem(STORAGE_NOTE_PREFIX + n) || '';
  } catch { return ''; }
}

// Pré-carrega do Firestore e atualiza cache + localStorage
async function preloadNotesFromFirestore() {
  try {
    const profile = await getProfile();
    const remote = profile?.morningNotes || {};
    notesCache = {};
    for (const key of Object.keys(remote)) {
      notesCache[key] = remote[key] || '';
      // Sincroniza com localStorage pra fast-load próximo
      try { localStorage.setItem(STORAGE_NOTE_PREFIX + key, remote[key] || ''); } catch {}
    }
    return notesCache;
  } catch (err) {
    console.warn('[mm-note] preload Firestore falhou:', err);
    return null;
  }
}

// Salva em localStorage (instant) + Firestore (debounced curto OU imediato)
let firestoreSaveTimer = null;
let pendingNotesToSave = {};

// Função interna que faz o write real no Firestore (mescla com remoto)
async function writeNotesToFirestore() {
  if (Object.keys(pendingNotesToSave).length === 0) return;
  const batch = { ...pendingNotesToSave };
  pendingNotesToSave = {};
  try {
    const profile = await getProfile() || {};
    const remote = profile.morningNotes || {};
    const merged = { ...remote, ...batch };
    await setProfile({ morningNotes: merged });
    console.log('[mm-note] ✓ Firestore SAVED:', Object.keys(batch).map(k => `${k}=${batch[k].length}c`).join(', '));
  } catch (err) {
    console.error('[mm-note] ✗ Firestore FAILED:', err);
    Object.assign(pendingNotesToSave, batch);  // re-coloca pra próxima tentativa
    throw err;
  }
}

function saveNote(n, text) {
  if (!notesCache) notesCache = {};
  notesCache[n] = text || '';
  pendingNotesToSave[n] = text || '';

  // Save SÍNCRONO em localStorage
  try { localStorage.setItem(STORAGE_NOTE_PREFIX + n, text || ''); }
  catch (err) { console.warn('[mm-note] localStorage falhou:', err); }

  // Save debounced curto (500ms) no Firestore
  clearTimeout(firestoreSaveTimer);
  firestoreSaveTimer = setTimeout(() => {
    writeNotesToFirestore().catch(() => {}); // erro já logado
  }, 500);
}

// Força flush IMEDIATO (await). Usado em close/navigate.
async function flushNoteSave() {
  clearTimeout(firestoreSaveTimer);
  if (Object.keys(pendingNotesToSave).length === 0) return;
  try { await writeNotesToFirestore(); }
  catch (err) { /* já logado em writeNotesToFirestore */ }
}

// Quando o usuário minimiza/fecha o app, FORÇA flush pra Firestore
// antes que ele perca a conexão ou os dados locais sejam limpos
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Object.keys(pendingNotesToSave).length > 0) {
      // fire-and-forget — o navegador pode matar o request, mas vale tentar
      writeNotesToFirestore().catch(() => {});
    }
  });
  // pagehide é mais confiável em iOS Safari pra "tab vai fechar"
  window.addEventListener('pagehide', () => {
    if (Object.keys(pendingNotesToSave).length > 0) {
      writeNotesToFirestore().catch(() => {});
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// MENSAGENS (só a 3 tem campo de anotações)
// ═══════════════════════════════════════════════════════════════
const MESSAGES = [
  {
    n: 1,
    title: 'Qual é a melhor versão de mim que posso ser hoje?',
    body: `
      <p>Reserve um instante para enxergar essa versão — como ela age, como fala, como respira o dia.</p>
      <p>Se o corpo te interromper pedindo comida, conforto ou descanso, responda com firmeza tranquila:</p>
      <blockquote>"Calma, corpo. Agora quem está no comando sou eu, a mente.<br>Logo te dou tudo o que você precisa."</blockquote>
    `,
    hasNotes: false
  },
  {
    n: 2,
    title: 'Observe seus pensamentos durante o dia.',
    body: `
      <p>Os pensamentos antigos afirmam o estado em que você não quer mais estar — e te seguram longe de onde você quer chegar. Quando aparecerem, identifique e diga:</p>
      <blockquote>"Esse é o meu velho eu. A partir de agora eu penso assim:"</blockquote>
      <p>E troque por algo firme e positivo, como:</p>
      <ul>
        <li>"Isso é fácil pra mim."</li>
        <li>"Vou tirar de letra."</li>
        <li>"Vou conseguir antes do tempo que imagino."</li>
        <li>"Vai ser mais rápido do que eu espero."</li>
      </ul>
    `,
    hasNotes: false
  },
  {
    n: 3,
    title: 'Que comportamento vou demonstrar? Que escolhas vou fazer hoje?',
    body: `
      <p>Instale essas respostas mentalmente — assumindo um novo estado, uma nova forma de se comunicar com você mesmo(a).</p>
      <p>É a partir desse acordo interno que o dia toma forma.</p>
    `,
    hasNotes: true,
    notesPlaceholder: 'Escreva como a melhor versão de você pensa, fala e age durante o dia. E ao longo do dia, se pergunte: "Quem está tomando essa ação agora — o eu de agora ou o eu do passado?"'
  }
];


// ═══════════════════════════════════════════════════════════════
// LISTA DAS 3 MENSAGENS
// ═══════════════════════════════════════════════════════════════
export function openMorningMessages() {
  markReadToday();
  // Pré-carrega as notas do Firestore em background (não bloqueia abrir a lista)
  // Quando o user abrir o detalhe da msg 3, o cache já estará pronto
  if (!notesCache) preloadNotesFromFirestore();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay morning-msgs-overlay';
  overlay.innerHTML = `
    <div class="modal morning-msgs-modal">
      <div class="mm-header">
        <div class="mm-eyebrow">Pergunte ao acordar</div>
        <div class="mm-title">💌 Mensagens</div>
      </div>

      <div class="mm-list">
        ${MESSAGES.map(m => `
          <button type="button" class="mm-item" data-mm="${m.n}">
            <span class="mm-num">${m.n}</span>
            <span class="mm-label">Mensagem ${m.n}</span>
            <span class="mm-chev">›</span>
          </button>
        `).join('')}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="mm-close">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = trapModalBack(() => overlay.remove());
  overlay.querySelector('#mm-close').addEventListener('click', close);
  // CLICK FORA NÃO FECHA
  overlay.querySelectorAll('[data-mm]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.mm, 10);
      close();
      setTimeout(() => openMessageDetail(n), 120);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// DETALHE — sem onReturn callback. Cada detail é independente.
// Navegação entre messages via prev/next.
// "Fechar" (na última) encerra de vez (não volta pra lista).
// ═══════════════════════════════════════════════════════════════
async function openMessageDetail(n) {
  const msg = MESSAGES.find(m => m.n === n);
  if (!msg) return;

  const isFirst = n === 1;
  const isLast = n === MESSAGES.length;
  const nextLabel = isLast ? 'Eu Decreto!' : 'Próxima ›';

  // Garante que as notas estão carregadas do Firestore antes de mostrar a UI
  if (msg.hasNotes && !notesCache) {
    await preloadNotesFromFirestore();
  }
  const initialNote = msg.hasNotes ? getNoteLocal(msg.n) : '';
  const notesBlockHtml = msg.hasNotes ? `
    <div class="mm-notes-wrap">
      <button type="button" class="mm-notes-toggle" id="mm-notes-toggle">
        <span class="mm-notes-toggle-ic">📝</span>
        <span class="mm-notes-toggle-text">Suas anotações</span>
        <span class="mm-notes-toggle-chev">▾</span>
      </button>
      <div class="mm-notes-body" id="mm-notes-body" hidden>
        <textarea id="mm-notes-textarea" placeholder="${msg.notesPlaceholder.replace(/"/g, '&quot;')}" rows="6">${initialNote.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        <div class="mm-notes-hint">Suas anotações ficam salvas — abra essa mensagem qualquer dia pra reler.</div>
      </div>
    </div>
  ` : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay morning-msgs-overlay';
  overlay.innerHTML = `
    <div class="modal morning-msgs-modal mm-detail">
      <div class="mm-detail-num">${msg.n}</div>
      <div class="mm-detail-title">${msg.title}</div>
      <div class="mm-detail-body">${msg.body}</div>
      ${notesBlockHtml}
      <div class="modal-actions mm-detail-actions">
        ${!isFirst ? '<button class="btn-secondary" id="mm-prev">‹ Anterior</button>' : ''}
        <button class="btn-primary" id="mm-next">${nextLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Bloco de notas: toggle + scroll into view + auto-save + persistência ──
  const notesToggle = overlay.querySelector('#mm-notes-toggle');
  const notesBody = overlay.querySelector('#mm-notes-body');
  const textarea = overlay.querySelector('#mm-notes-textarea');
  if (notesToggle && notesBody) {
    // Auto-abre se já tem conteúdo salvo
    if (initialNote.trim().length > 0) {
      notesBody.hidden = false;
      notesToggle.classList.add('open');
    }
    notesToggle.addEventListener('click', () => {
      const willOpen = notesBody.hidden;
      notesBody.hidden = !willOpen;
      notesToggle.classList.toggle('open', willOpen);
      if (willOpen) {
        // Garante que o textarea fique VISÍVEL acima do teclado mobile
        setTimeout(() => {
          textarea?.focus();
          textarea?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    });
  }

  // Auto-save da nota (debounced) + save no blur + save antes de navegar/fechar
  let saveTimer = null;
  const persistNote = () => {
    if (textarea) saveNote(msg.n, textarea.value);
  };
  if (textarea) {
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistNote, 250);
    });
    // Blur (perdeu foco) → IMEDIATO save no Firestore (não espera o debounce)
    textarea.addEventListener('blur', async () => {
      persistNote();
      await flushNoteSave();
    });
    // Quando textarea recebe foco, rola pra mantê-lo visível acima do teclado
    textarea.addEventListener('focus', () => {
      setTimeout(() => textarea.scrollIntoView({ behavior: 'smooth', block: 'center' }), 280);
    });
  }

  // trapModalBack: ao fechar via back-button do celular, persiste + flush Firestore
  const closeViaTrap = trapModalBack(() => {
    persistNote();
    flushNoteSave(); // garante salvar no Firestore agora (não espera o debounce)
    overlay.remove();
  });

  // CLICK FORA NÃO FECHA

  const goNext = async () => {
    persistNote();
    await flushNoteSave();
    if (isLast) {
      closeViaTrap();
      return;
    }
    closeViaTrap();
    setTimeout(() => openMessageDetail(n + 1), 120);
  };

  const goPrev = async () => {
    persistNote();
    await flushNoteSave();
    closeViaTrap();
    setTimeout(() => openMessageDetail(n - 1), 120);
  };

  overlay.querySelector('#mm-next').addEventListener('click', goNext);
  overlay.querySelector('#mm-prev')?.addEventListener('click', goPrev);
}
