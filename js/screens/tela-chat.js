// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ESTADO
// BLOCO 2 — ENTRY POINT
// BLOCO 3 — MURAL DA COMUNIDADE
// BLOCO 4 — PRIVADO: conversas + todo mundo que está no app
// BLOCO 5 — PRIVADO: a conversa em si
// BLOCO 6 — HELPERS
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + ESTADO
// ═══════════════════════════════════════════════════════════════
// Chat da comunidade. Duas modalidades: mural (um fala para todos) e
// privado (dois a dois). Mensagens somem sozinhas em 7 dias — e isso é
// mostrado na tela, senão as pessoas contam com um histórico que não existe.
//
// Sem anexos: não há upload de arquivo nem de imagem nesta versão.
import {
  fetchMural, enviarNoMural, fetchConversas, fetchConversa, enviarPrivado,
  fetchMembros, apagarMensagem, faxinaChat, meuNomeDeChat, tempoRestante,
} from '../chat.js';
import { bottomNav } from '../components/menu-inferior.js';
import { auth } from '../autenticacao.js';
import { showToast, confirmModal } from '../aviso-tela.js';

let aba = 'mural';        // 'mural' | 'privado'
let conversaCom = null;   // { id, nome } quando aberta
let meuNome = 'Falcão';
let recarga = null;       // timer de atualização enquanto a tela está aberta

// ═══════════════════════════════════════════════════════════════
// TECLADO ABERTO
// ═══════════════════════════════════════════════════════════════
// A conversa é `position: fixed` de 0 até o cinturão. Quando o teclado sobe,
// a viewport de layout NÃO encolhe: o campo de escrever fica atrás do teclado
// e o topo da conversa sai da tela. Mesmo problema que o painel do pet tinha.
// Aqui a base da conversa passa a acompanhar a altura real do teclado.
function ajustarConversaAoTeclado() {
  const cheia = document.querySelector('.chat-cheia');
  if (!cheia) return;
  const vv = window.visualViewport;
  const visivel = vv ? vv.height : window.innerHeight;
  const teclado = Math.max(0, Math.round(window.innerHeight - visivel));
  // Sem teclado devolve o controle pro CSS (base no cinturão).
  cheia.style.bottom = teclado < 80 ? '' : (teclado + 8) + 'px';
  const lista = cheia.querySelector('#chat-lista');
  if (lista) lista.scrollTop = lista.scrollHeight;
}
if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', ajustarConversaAoTeclado);
  window.visualViewport.addEventListener('scroll', ajustarConversaAoTeclado);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ENTRY POINT
// ═══════════════════════════════════════════════════════════════
export async function renderChat(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">Carregando conversas…</div>`;
  meuNome = await meuNomeDeChat();
  faxinaChat();   // sem await: é limpeza de fundo

  desenharCasca(app);
  await recarregar();

  // Atualiza enquanto a tela estiver aberta. Ao sair, o cleanup do roteador
  // derruba o timer — sem isso ele seguiria batendo no banco pra sempre.
  clearInterval(recarga);
  recarga = setInterval(() => { if (document.getElementById('chat-corpo')) recarregar(); }, 12000);
  return () => { clearInterval(recarga); recarga = null; conversaCom = null; };
}

function desenharCasca(app) {
  app.innerHTML = `
    <div class="screen-pad chat-tela">
      <div class="screen-title">
        <h1>💬 Conversas</h1>
        <div class="sub">As mensagens somem sozinhas depois de 7 dias.</div>
      </div>

      <div class="tab-switch" id="chat-abas">
        <button class="tab-btn ${aba === 'mural' ? 'active' : ''}" data-aba="mural">📣 Comunidade</button>
        <button class="tab-btn ${aba === 'privado' ? 'active' : ''}" data-aba="privado">🔒 Privado</button>
      </div>

      <div id="chat-corpo"></div>
    </div>
    ${bottomNav('chat')}
  `;
  ligarEventos(app);
}

async function recarregar() {
  const corpo = document.getElementById('chat-corpo');
  if (!corpo) return;
  if (aba === 'mural') return desenharMural(corpo);
  if (conversaCom) return desenharConversa(corpo);
  return desenharListaPrivada(corpo);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MURAL DA COMUNIDADE
// ═══════════════════════════════════════════════════════════════
async function desenharMural(corpo) {
  let msgs = [];
  try { msgs = await fetchMural(); }
  catch (e) { corpo.innerHTML = erro(e); return; }

  const meu = auth.currentUser?.uid;
  const lista = msgs.length
    ? msgs.map((m, i) => linhaDiscord(m, msgs[i - 1], m.autor_id === meu)).join('')
    : `<div class="chat-vazio">Ninguém falou nada ainda.<br>Abre o jogo — a comunidade lê.</div>`;

  pintar(corpo, lista, 'Falar com a comunidade…');
}

// Linha no estilo Discord: avatar + nome + texto corrido, sem balão.
// Mensagens seguidas da MESMA pessoa em até 5 min são agrupadas — sem isso
// um desabafo de três frases vira três blocos com o nome repetido.
function linhaDiscord(m, anterior, minha) {
  const agrupa = anterior
    && anterior.autor_id === m.autor_id
    && (new Date(m.created_at) - new Date(anterior.created_at)) < 5 * 60 * 1000;

  const nome = m.autor_nome || 'Falcão';
  const cabecalho = agrupa ? '' : `
      <div class="dc-head">
        <span class="dc-nome" style="color:${corDe(m.autor_id)}">${esc(nome)}</span>
        <span class="dc-hora">${hora(m.created_at)} · some em ${tempoRestante(m.created_at)}</span>
        ${minha ? `<button class="chat-apagar" data-apagar="${m.id}">apagar</button>` : ''}
      </div>`;

  return `
    <div class="dc-msg ${agrupa ? 'dc-cont' : ''}" data-id="${m.id}">
      <div class="dc-av" ${agrupa ? '' : `style="background:${corDe(m.autor_id)}22;color:${corDe(m.autor_id)}"`}>
        ${agrupa ? '' : inicial(nome)}
      </div>
      <div class="dc-body">${cabecalho}<div class="dc-txt">${esc(m.texto)}</div></div>
    </div>`;
}

// Cor estável por pessoa, derivada do id — cada um sempre com a mesma cor,
// como no Discord. Tons fixos pra garantir contraste no fundo escuro.
const PALETA = ['#7ea6ff', '#5fd3a5', '#f4a261', '#e879a6', '#c4a2f5', '#6fd0e0', '#f2c94c', '#ff9b85'];
function corDe(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: PRIVADO — conversas + todo mundo que está no app
// ═══════════════════════════════════════════════════════════════
async function desenharListaPrivada(corpo) {
  // As duas listas juntas: com quem já falei e todo mundo que está no app.
  let convs = [], membros = [];
  try {
    [convs, membros] = await Promise.all([fetchConversas(), fetchMembros()]);
  } catch (e) {
    corpo.innerHTML = erro(e);
    return;
  }

  const jaFalei = new Set(convs.map(c => c.outro_id));
  const outros = membros.filter(m => !jaFalei.has(m.user_id));

  const linhasConv = convs.map(c => `
      <button class="chat-conv" data-abrir="${c.outro_id}" data-nome="${esc(c.nome)}">
        <span class="chat-conv-av" style="background:${corDe(c.outro_id)}22;color:${corDe(c.outro_id)}">${inicial(c.nome)}</span>
        <span class="chat-conv-txt">
          <span class="chat-conv-nome">${esc(c.nome)}</span>
          <span class="chat-conv-ult">${c.minha ? 'Você: ' : ''}${esc(corta(c.ultima, 44))}</span>
        </span>
        <span class="chat-conv-quando">${tempoRestante(c.quando)}</span>
      </button>`).join('');

  const linhasMembros = outros.map(m => `
      <button class="chat-conv" data-abrir="${m.user_id}" data-nome="${esc(m.nome)}">
        <span class="chat-conv-av" style="background:${corDe(m.user_id)}22;color:${corDe(m.user_id)}">${inicial(m.nome)}</span>
        <span class="chat-conv-txt"><span class="chat-conv-nome">${esc(m.nome)}</span></span>
        <span class="chat-conv-quando">conversar</span>
      </button>`).join('');

  corpo.innerHTML = `
    <input class="chat-busca" id="chat-filtro" placeholder="Buscar pessoa…" autocomplete="off" />
    ${convs.length ? `<div class="chat-sec">Suas conversas</div><div class="chat-convs">${linhasConv}</div>` : ''}
    ${outros.length
      ? `<div class="chat-sec">Todos no app</div><div class="chat-convs">${linhasMembros}</div>`
      : (convs.length ? '' : `<div class="chat-vazio">Ninguém mais por aqui ainda.<br>Assim que a comunidade crescer, os nomes aparecem nesta lista.</div>`)}`;

  const filtro = corpo.querySelector('#chat-filtro');
  filtro?.addEventListener('input', () => {
    const q = filtro.value.trim().toLowerCase();
    corpo.querySelectorAll('.chat-conv').forEach(b => {
      b.style.display = b.dataset.nome.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: PRIVADO — a conversa
// ═══════════════════════════════════════════════════════════════
async function desenharConversa(corpo) {
  let msgs = [];
  try { msgs = await fetchConversa(conversaCom.id); }
  catch (e) { corpo.innerHTML = erro(e); return; }

  const meu = auth.currentUser?.uid;
  const lista = msgs.length
    ? msgs.map((m, i) => separadorDeDia(m, msgs[i - 1]) + balao(m, m.autor_id === meu, false)).join('')
    : `<div class="chat-vazio">Comece a conversa com ${esc(conversaCom.nome)}.</div>`;

  pintar(corpo, lista, `Mensagem para ${conversaCom.nome}…`, `
    <button class="chat-voltar" id="chat-voltar" aria-label="Voltar">‹</button>
    <span class="chat-conv-av" style="background:${corDe(conversaCom.id)}22;color:${corDe(conversaCom.id)}">${inicial(conversaCom.nome)}</span>
    <span class="chat-titulo-conv">${esc(conversaCom.nome)}</span>`);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HELPERS
// ═══════════════════════════════════════════════════════════════
function pintar(corpo, lista, placeholder, cabecalho = '') {
  // Com cabeçalho = conversa aberta, e aí ela toma a TELA INTEIRA como no
  // WhatsApp: título e abas do app somem, cabeçalho no topo, mensagens
  // ocupando o meio e o campo colado no rodapé. Presa embaixo das abas ela
  // ficava com um terço da altura e não parecia uma conversa.
  const corpoHtml = `
    ${cabecalho ? `<div class="chat-cab">${cabecalho}</div>` : ''}
    <div class="chat-lista ${cabecalho ? 'wa-fundo' : ''}" id="chat-lista">${lista}</div>
    <form class="chat-envio" id="chat-envio">
      <input id="chat-texto" placeholder="${esc(placeholder)}" maxlength="2000" autocomplete="off" />
      <button type="submit" class="chat-enviar" aria-label="Enviar">➤</button>
    </form>`;

  corpo.innerHTML = cabecalho ? `<div class="chat-cheia">${corpoHtml}</div>` : corpoHtml;
  const l = corpo.querySelector('#chat-lista');
  if (l) l.scrollTop = l.scrollHeight;
  if (cabecalho) ajustarConversaAoTeclado();   // o teclado pode já estar aberto
}

// "Hoje" / "Ontem" / a data, quando a conversa vira o dia — sem isso uma
// troca de mensagens de semanas parece ter acontecido toda de uma vez.
function separadorDeDia(m, anterior) {
  const dia = new Date(m.created_at).toDateString();
  if (anterior && new Date(anterior.created_at).toDateString() === dia) return '';
  const hoje = new Date().toDateString();
  const ontem = new Date(Date.now() - 86400000).toDateString();
  const rotulo = dia === hoje ? 'Hoje'
    : dia === ontem ? 'Ontem'
    : new Date(m.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' });
  return `<div class="wa-dia"><span>${rotulo}</span></div>`;
}

function balao(m, minha, mostrarAutor) {
  // Estilo WhatsApp: a hora vai DENTRO da bolha, no canto de baixo. Fora dela
  // cada mensagem ganhava uma linha extra e a conversa ficava esparramada.
  return `
    <div class="wa-msg ${minha ? 'minha' : ''}" data-id="${m.id}">
      <div class="wa-bolha">
        ${mostrarAutor && !minha ? `<span class="wa-autor">${esc(m.autor_nome || 'Falcão')}</span>` : ''}
        <span class="wa-txt">${esc(m.texto)}</span>
        <span class="wa-hora">${hora(m.created_at)} · ${tempoRestante(m.created_at)}
          ${minha ? `<button class="chat-apagar" data-apagar="${m.id}">apagar</button>` : ''}</span>
      </div>
    </div>`;
}

function ligarEventos(app) {
  app.addEventListener('click', async (ev) => {
    const t = ev.target;

    const btnAba = t.closest('[data-aba]');
    if (btnAba) {
      aba = btnAba.dataset.aba;
      conversaCom = null;
      app.querySelectorAll('[data-aba]').forEach(b => b.classList.toggle('active', b.dataset.aba === aba));
      return recarregar();
    }
    if (t.closest('#chat-voltar')) { conversaCom = null; return recarregar(); }

    const conv = t.closest('[data-abrir]');
    if (conv) {
      conversaCom = { id: conv.dataset.abrir, nome: conv.dataset.nome };
      return recarregar();
    }

    const apagar = t.closest('[data-apagar]');
    if (apagar) {
      const ok = await confirmModal({
        title: 'Apagar mensagem?', message: 'Ela some para todo mundo.',
        confirmText: 'Apagar', cancelText: 'Manter', danger: true,
      });
      if (!ok) return;
      try { await apagarMensagem(apagar.dataset.apagar); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
    }
  });

  app.addEventListener('submit', async (ev) => {
    if (!ev.target.closest('#chat-envio')) return;
    ev.preventDefault();
    const campo = app.querySelector('#chat-texto');
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = '';
    try {
      if (aba === 'mural') await enviarNoMural(texto, meuNome);
      else if (conversaCom) await enviarPrivado(conversaCom.id, texto, meuNome);
      await recarregar();
    } catch (e) {
      campo.value = texto;   // devolve o que a pessoa escreveu
      showToast(e.message || 'Não deu pra enviar', 'error');
    }
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const corta = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const inicial = (n) => esc(String(n || 'F').trim().charAt(0).toUpperCase());
const hora = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const erro = (e) => `<div class="chat-vazio">Não deu pra carregar: ${esc(e.message || e)}</div>`;
