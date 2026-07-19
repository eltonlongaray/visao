// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ESTADO
// BLOCO 2 — ENTRY POINT
// BLOCO 3 — MURAL DA COMUNIDADE
// BLOCO 4 — PRIVADO: lista de conversas e escolha de membro
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
    ? msgs.map(m => balao(m, m.autor_id === meu, true)).join('')
    : `<div class="chat-vazio">Ninguém falou nada ainda.<br>Abre o jogo — a comunidade lê.</div>`;

  pintar(corpo, lista, 'Falar com a comunidade…');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: PRIVADO — lista de conversas e escolha de membro
// ═══════════════════════════════════════════════════════════════
async function desenharListaPrivada(corpo) {
  const convs = await fetchConversas();
  const linhas = convs.length
    ? convs.map(c => `
        <button class="chat-conv" data-abrir="${c.outro_id}" data-nome="${esc(c.nome)}">
          <span class="chat-conv-av">${inicial(c.nome)}</span>
          <span class="chat-conv-txt">
            <span class="chat-conv-nome">${esc(c.nome)}</span>
            <span class="chat-conv-ult">${c.minha ? 'Você: ' : ''}${esc(corta(c.ultima, 48))}</span>
          </span>
          <span class="chat-conv-quando">${tempoRestante(c.quando)}</span>
        </button>`).join('')
    : `<div class="chat-vazio">Nenhuma conversa ainda.<br>Toque em <strong>Nova conversa</strong> pra começar.</div>`;

  corpo.innerHTML = `
    <button class="chat-nova" id="chat-nova">＋ Nova conversa</button>
    <div class="chat-convs">${linhas}</div>`;
}

async function abrirEscolhaDeMembro() {
  const membros = await fetchMembros();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-title">Conversar com quem?</div>
      <input class="chat-busca" id="chat-busca" placeholder="Buscar pelo nome…" autocomplete="off" />
      <div class="chat-membros" id="chat-membros">
        ${membros.length
          ? membros.map(m => `<button class="chat-membro" data-id="${m.user_id}" data-nome="${esc(m.nome)}">
               <span class="chat-conv-av">${inicial(m.nome)}</span>${esc(m.nome)}</button>`).join('')
          : '<div class="chat-vazio">Ninguém mais por aqui ainda.</div>'}
      </div>
      <div class="modal-actions"><button class="btn-secondary" id="chat-cancelar" style="width:100%">Fechar</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.querySelector('#chat-cancelar').onclick = fechar;
  overlay.querySelector('#chat-busca').addEventListener('input', (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    overlay.querySelectorAll('.chat-membro').forEach(b => {
      b.style.display = b.dataset.nome.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  overlay.querySelectorAll('.chat-membro').forEach(b => {
    b.onclick = () => {
      conversaCom = { id: b.dataset.id, nome: b.dataset.nome };
      fechar();
      recarregar();
    };
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
    ? msgs.map(m => balao(m, m.autor_id === meu, false)).join('')
    : `<div class="chat-vazio">Comece a conversa com ${esc(conversaCom.nome)}.</div>`;

  pintar(corpo, lista, `Mensagem para ${conversaCom.nome}…`, `
    <button class="chat-voltar" id="chat-voltar">‹ Conversas</button>
    <span class="chat-titulo-conv">${esc(conversaCom.nome)}</span>`);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HELPERS
// ═══════════════════════════════════════════════════════════════
function pintar(corpo, lista, placeholder, cabecalho = '') {
  corpo.innerHTML = `
    ${cabecalho ? `<div class="chat-cab">${cabecalho}</div>` : ''}
    <div class="chat-lista" id="chat-lista">${lista}</div>
    <form class="chat-envio" id="chat-envio">
      <input id="chat-texto" placeholder="${esc(placeholder)}" maxlength="2000" autocomplete="off" />
      <button type="submit" class="chat-enviar" aria-label="Enviar">➤</button>
    </form>`;
  const l = corpo.querySelector('#chat-lista');
  if (l) l.scrollTop = l.scrollHeight;
}

function balao(m, minha, mostrarAutor) {
  return `
    <div class="chat-msg ${minha ? 'minha' : ''}" data-id="${m.id}">
      ${mostrarAutor && !minha ? `<div class="chat-autor">${esc(m.autor_nome || 'Falcão')}</div>` : ''}
      <div class="chat-bolha">${esc(m.texto)}</div>
      <div class="chat-meta">${hora(m.created_at)} · some em ${tempoRestante(m.created_at)}
        ${minha ? `<button class="chat-apagar" data-apagar="${m.id}">apagar</button>` : ''}</div>
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
    if (t.closest('#chat-nova')) return abrirEscolhaDeMembro();
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
