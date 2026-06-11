// ═══════════════════════════════════════════════════════════════
// VISÃO · Mensagens da manhã — 3 perguntas reflexivas
// Mensagens 1 e 2 têm campo de anotações persistente (localStorage).
// Navegação: anterior / próxima, com X de fechar (botão Sair na última).
// NÃO fecha ao clicar fora — apenas pelos botões.
// ═══════════════════════════════════════════════════════════════
import { trapModalBack } from './modal-back.js';

const STORAGE_LAST_READ = 'visao_msgs_last_read_day';
const STORAGE_NOTE_PREFIX = 'visao_msg_note_';

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

function getNote(n) {
  return localStorage.getItem(STORAGE_NOTE_PREFIX + n) || '';
}
function saveNote(n, text) {
  localStorage.setItem(STORAGE_NOTE_PREFIX + n, text || '');
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONTEÚDO — as 3 mensagens (mantém a essência do autor)
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
    hasNotes: true,
    notesPlaceholder: 'Anote quem você quer ser hoje, traços, atitudes, decisões...'
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
    hasNotes: true,
    notesPlaceholder: 'Pensamentos estratégicos pro dia...'
  },
  {
    n: 3,
    title: 'Que comportamento vou demonstrar? Que escolhas vou fazer hoje?',
    body: `
      <p>Instale essas respostas mentalmente — assumindo um novo estado, uma nova forma de se comunicar com você mesmo(a).</p>
      <p>É a partir desse acordo interno que o dia toma forma.</p>
    `,
    hasNotes: false
  }
];


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ABRE A LISTA DAS 3 MENSAGENS
// ═══════════════════════════════════════════════════════════════
export function openMorningMessages() {
  markReadToday();

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
  // CLICK FORA NÃO FECHA (omitido propositalmente conforme pedido do user)
  overlay.querySelectorAll('[data-mm]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.mm, 10);
      // Fecha a lista e abre o detalhe pra evitar trap aninhado complexo
      close();
      setTimeout(() => openMessageDetail(n, () => openMorningMessages()), 120);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: DETALHE DE UMA MENSAGEM (com nav prev/next + notas persistentes)
// onReturn (opcional): callback chamado ao fechar/sair — útil pra reabrir a lista
// ═══════════════════════════════════════════════════════════════
function openMessageDetail(n, onReturn) {
  const msg = MESSAGES.find(m => m.n === n);
  if (!msg) return;

  // Botões: prev (se n>1) + próxima/sair
  const isFirst = n === 1;
  const isLast = n === MESSAGES.length;
  const nextLabel = isLast ? 'Sair' : 'Próxima ›';

  // Bloco de anotações: textarea com placeholder + load + auto-save
  const notesBlockHtml = msg.hasNotes ? `
    <div class="mm-notes-wrap">
      <button type="button" class="mm-notes-toggle" id="mm-notes-toggle">
        <span class="mm-notes-toggle-ic">📝</span>
        <span class="mm-notes-toggle-text">Suas anotações</span>
        <span class="mm-notes-toggle-chev">▾</span>
      </button>
      <div class="mm-notes-body" id="mm-notes-body" hidden>
        <textarea id="mm-notes-textarea" placeholder="${msg.notesPlaceholder.replace(/"/g, '&quot;')}" rows="6">${(getNote(msg.n) || '').replace(/</g, '&lt;')}</textarea>
        <div class="mm-notes-hint">Salvo automaticamente. Volte aqui pra reler quando quiser.</div>
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

  // Toggle do bloco de notas (expandido se ja tem conteudo)
  const notesToggle = overlay.querySelector('#mm-notes-toggle');
  const notesBody = overlay.querySelector('#mm-notes-body');
  if (notesToggle && notesBody) {
    if ((getNote(msg.n) || '').trim().length > 0) {
      notesBody.hidden = false;
      notesToggle.classList.add('open');
    }
    notesToggle.addEventListener('click', () => {
      notesBody.hidden = !notesBody.hidden;
      notesToggle.classList.toggle('open', !notesBody.hidden);
      if (!notesBody.hidden) {
        setTimeout(() => overlay.querySelector('#mm-notes-textarea')?.focus(), 100);
      }
    });
  }

  // Auto-save da nota (debounced) — não perde nada se o app fechar
  const textarea = overlay.querySelector('#mm-notes-textarea');
  let saveTimer = null;
  if (textarea) {
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveNote(msg.n, textarea.value), 250);
    });
  }

  const finishClose = trapModalBack(() => {
    if (textarea) saveNote(msg.n, textarea.value); // garante salvar ao fechar
    overlay.remove();
    if (onReturn) onReturn();
  });

  // CLICK FORA NÃO FECHA (omitido propositalmente)

  const goNext = () => {
    if (textarea) saveNote(msg.n, textarea.value);
    if (isLast) {
      // Última mensagem: o "Sair" fecha tudo (sem reabrir a lista)
      overlay.remove();
      // Limpa o trap manualmente
      try { history.back(); } catch {}
      return;
    }
    // Vai pra próxima — fecha esse detalhe (sem callback de volta) e abre o próximo
    overlay.remove();
    try { history.back(); } catch {}
    setTimeout(() => openMessageDetail(n + 1, onReturn), 60);
  };

  const goPrev = () => {
    if (textarea) saveNote(msg.n, textarea.value);
    overlay.remove();
    try { history.back(); } catch {}
    setTimeout(() => openMessageDetail(n - 1, onReturn), 60);
  };

  overlay.querySelector('#mm-next').addEventListener('click', goNext);
  overlay.querySelector('#mm-prev')?.addEventListener('click', goPrev);
}
