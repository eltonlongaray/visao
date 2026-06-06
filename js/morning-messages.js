// ═══════════════════════════════════════════════════════════════
// VISÃO · Mensagens da manhã — 3 perguntas reflexivas pra começar o dia
// Não é entrada de dados: é leitura/reflexão.
// Marca como "lido hoje" no localStorage pra esconder a bolinha vermelha.
// ═══════════════════════════════════════════════════════════════
const STORAGE_LAST_READ = 'visao_msgs_last_read_day';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: STATE — leitura do dia
// ═══════════════════════════════════════════════════════════════
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
    `
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
    `
  },
  {
    n: 3,
    title: 'Que comportamento vou demonstrar? Que escolhas vou fazer hoje?',
    body: `
      <p>Instale essas respostas mentalmente — assumindo um novo estado, uma nova forma de se comunicar com você mesmo(a).</p>
      <p>É a partir desse acordo interno que o dia toma forma.</p>
    `
  }
];


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ABRE O MODAL
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

  // Back button do celular fecha o modal
  let popped = false, cameFromPop = false;
  const onPop = () => { cameFromPop = true; close(); };
  window.addEventListener('popstate', onPop);
  history.pushState({ mmModal: true }, '');
  const close = () => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    overlay.remove();
    if (!cameFromPop) setTimeout(() => { try { history.back(); } catch {} }, 0);
  };

  overlay.querySelector('#mm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-mm]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.mm, 10);
      openMessageDetail(n);
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: DETALHE DE UMA MENSAGEM
// ═══════════════════════════════════════════════════════════════
function openMessageDetail(n) {
  const msg = MESSAGES.find(m => m.n === n);
  if (!msg) return;

  // Define o botão de acordo com qual mensagem estamos
  let btnLabel, btnAction;
  if (n === 1) {
    btnLabel = 'Avançar para a próxima pergunta ›';
    btnAction = 'next';
  } else if (n === 2) {
    btnLabel = 'Avançar para a última pergunta ›';
    btnAction = 'next';
  } else {
    btnLabel = '‹ Voltar';
    btnAction = 'close';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay morning-msgs-overlay';
  overlay.innerHTML = `
    <div class="modal morning-msgs-modal mm-detail">
      <div class="mm-detail-num">${msg.n}</div>
      <div class="mm-detail-title">${msg.title}</div>
      <div class="mm-detail-body">${msg.body}</div>
      <div class="modal-actions">
        <button class="btn-primary" id="mm-action">${btnLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let popped = false, cameFromPop = false;
  const onPop = () => { cameFromPop = true; close(); };
  window.addEventListener('popstate', onPop);
  history.pushState({ mmDetail: true }, '');
  const close = () => {
    if (popped) return;
    popped = true;
    window.removeEventListener('popstate', onPop);
    overlay.remove();
    if (!cameFromPop) setTimeout(() => { try { history.back(); } catch {} }, 0);
  };

  overlay.querySelector('#mm-action').addEventListener('click', () => {
    if (btnAction === 'next') {
      // Fecha esse detalhe e abre o próximo logo em seguida
      close();
      // Pequeno delay pra animação do popstate completar
      setTimeout(() => openMessageDetail(n + 1), 60);
    } else {
      close();
    }
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
