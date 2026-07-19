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
  fetchMembros, fetchPerfis, apagarMensagem, editarMensagem, faxinaChat, meuNomeDeChat, tempoRestante,
} from '../chat.js';
import { bottomNav } from '../components/menu-inferior.js';
import { auth } from '../autenticacao.js';
import { getProfile } from '../banco-dados.js';
import { showToast, confirmModal } from '../aviso-tela.js';

let aba = 'mural';        // 'mural' | 'privado'
let conversaCom = null;   // { id, nome } quando aberta
let meuNome = 'Falcão';
let recarga = null;       // timer de atualização enquanto a tela está aberta
let editando = null;      // id da mensagem em edição
// Mesma fonte que o RLS usa (profiles.is_admin), não a lista de e-mails do
// app: se as duas divergissem, o botão apareceria e a exclusão falharia.
let souAdmin = false;
let perfis = new Map();   // id -> { nome, foto }, alimentado por fetchPerfis()

// ═══════════════════════════════════════════════════════════════
// TECLADO ABERTO
// ═══════════════════════════════════════════════════════════════
// A conversa é `position: fixed` de 0 até o cinturão. Quando o teclado sobe,
// a viewport de layout NÃO encolhe: o campo de escrever fica atrás do teclado
// e o topo da conversa sai da tela. Mesmo problema que o painel do pet tinha.
// Aqui a base da conversa passa a acompanhar a altura real do teclado.
function ajustarConversaAoTeclado() {
  const vv = window.visualViewport;
  const visivel = vv ? vv.height : window.innerHeight;
  // Quanto do rodapé do layout viewport o teclado encobre. Medir por
  // (innerHeight - vv.height) dava 0 nos engines que ENCOLHEM o layout
  // viewport — e aí nada era ajustado, enquanto o CSS seguia calculando com
  // 100vh, que não encolhe. Descontar o offsetTop cobre os dois casos.
  const teclado = vv
    ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    : 0;

  // Conversa privada: é fixa, então a base sobe junto com o teclado.
  const cheia = document.querySelector('.chat-cheia');
  if (cheia) cheia.style.bottom = teclado < 80 ? '' : (teclado + 8) + 'px';

  // Mural: está no fluxo da tela, então quem encolhe é a altura dela.
  // Escrita em px a partir do que está VISÍVEL, e não em calc(100vh - …):
  // 100vh é a viewport grande e não acompanha nem o teclado nem a barra do
  // navegador, então o mural transbordava por baixo. 84 = cinturão + respiro.
  const tela = document.querySelector('.chat-tela');
  if (tela) tela.style.height = Math.max(240, Math.round(visivel - 84)) + 'px';

  const lista = document.getElementById('chat-lista');
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
  try { souAdmin = !!(await getProfile())?.isAdmin; } catch { souAdmin = false; }
  faxinaChat();   // sem await: é limpeza de fundo

  desenharCasca(app);
  ajustarConversaAoTeclado();   // dimensiona pela tela visível já na entrada
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
  // Rostos antes de desenhar. fetchPerfis tem cache de 5 min, então o
  // recarregamento de 12 em 12 segundos não vira uma chamada a cada ciclo.
  perfis = await fetchPerfis();
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
        <span class="dc-hora">${hora(m.created_at)}${m.editada_em ? ' · editada' : ''} · some em ${tempoRestante(m.created_at)}</span>
      </div>`;

  return `
    <div class="dc-msg ${agrupa ? 'dc-cont' : ''}" data-id="${m.id}">
      ${agrupa ? '<div class="dc-av"></div>' : avatar(m.autor_id, nome, 'dc-av')}
      <div class="dc-body">${cabecalho}<div class="dc-txt">${esc(m.texto)}</div></div>
      ${minha || souAdmin ? menuDaMensagem(m.id, minha) : ''}
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

// Foto se houver, inicial colorida se não. Nunca as duas: quando a imagem
// falha (link do Google que caducou, rede fora) o onerror devolve a inicial —
// senão sobraria um quadrado quebrado no lugar do rosto.
function avatar(id, nome, classe) {
  const foto = perfis.get(id)?.foto;
  const cor = corDe(id);
  if (!foto) return `<span class="${classe}" style="background:${cor}22;color:${cor}">${inicial(nome)}</span>`;
  const alt = `<span class=&quot;${classe}&quot; style=&quot;background:${cor}22;color:${cor}&quot;>${inicial(nome)}</span>`;
  return `<img class="${classe} tem-foto" src="${esc(foto)}" alt="" loading="lazy"
    onerror="this.outerHTML='${alt.replace(/'/g, "&#39;")}'" />`;
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
        ${avatar(c.outro_id, c.nome, 'chat-conv-av')}
        <span class="chat-conv-txt">
          <span class="chat-conv-nome">${esc(c.nome)}</span>
          <span class="chat-conv-ult">${c.minha ? 'Você: ' : ''}${esc(corta(c.ultima, 44))}</span>
        </span>
        <span class="chat-conv-quando">${tempoRestante(c.quando)}</span>
      </button>`).join('');

  const linhasMembros = outros.map(m => `
      <button class="chat-conv" data-abrir="${m.user_id}" data-nome="${esc(m.nome)}">
        ${avatar(m.user_id, m.nome, 'chat-conv-av')}
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
    ${avatar(conversaCom.id, conversaCom.nome, 'chat-conv-av')}
    <span class="chat-titulo-conv">${esc(conversaCom.nome)}</span>`);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: HELPERS
// ═══════════════════════════════════════════════════════════════
// Rascunho por modo (mural / cada conversa). Existe pra sobreviver a uma
// remontagem completa — trocar de aba e voltar não deve comer o que a pessoa
// já tinha escrito.
const rascunhos = new Map();
function modoAtual() { return `${aba}:${conversaCom?.id || ''}`; }
function guardarRascunho() {
  const campo = document.getElementById('chat-texto');
  if (!campo) return;
  if (campo.value) rascunhos.set(modoAtual(), campo.value);
  else rascunhos.delete(modoAtual());
}

function pintar(corpo, lista, placeholder, cabecalho = '') {
  const modo = modoAtual();

  // ── Atualização em pé: só a LISTA é reescrita ──
  // Reescrever o corpo inteiro a cada ciclo de 12s arrancava o campo de
  // escrita do DOM. Com ele ia o foco: o teclado fechava sozinho e o texto
  // em andamento sumia no meio da frase. O formulário agora sobrevive ao
  // recarregamento; só o conteúdo da lista é trocado.
  const listaEl = corpo.querySelector('#chat-lista');
  if (corpo.dataset.modo === modo && listaEl && corpo.querySelector('#chat-texto')) {
    // Só puxa pro fim se a pessoa JÁ estava no fim. Quem subiu pra ler o
    // histórico era jogado de volta pra baixo a cada atualização.
    const noFim = listaEl.scrollHeight - listaEl.scrollTop - listaEl.clientHeight < 60;
    listaEl.innerHTML = lista;
    if (noFim) listaEl.scrollTop = listaEl.scrollHeight;
    return;
  }

  // Com cabeçalho = conversa aberta, e aí ela toma a TELA INTEIRA como no
  // WhatsApp: título e abas do app somem, cabeçalho no topo, mensagens
  // ocupando o meio e o campo colado no rodapé. Presa embaixo das abas ela
  // ficava com um terço da altura e não parecia uma conversa.
  const corpoHtml = `
    ${cabecalho ? `<div class="chat-cab">${cabecalho}</div>` : ''}
    <div class="chat-lista ${cabecalho ? 'wa-fundo' : ''}" id="chat-lista">${lista}</div>
    <form class="chat-envio" id="chat-envio">
      <textarea id="chat-texto" placeholder="${esc(placeholder)}" maxlength="2000"
        rows="1" autocomplete="off" enterkeyhint="enter"></textarea>
      <button type="button" class="chat-cancelar-ed" id="chat-cancelar-edicao" aria-label="Cancelar edição">✕</button>
      <button type="submit" class="chat-enviar" aria-label="Enviar">➤</button>
    </form>`;

  corpo.innerHTML = cabecalho ? `<div class="chat-cheia">${corpoHtml}</div>` : corpoHtml;
  corpo.dataset.modo = modo;

  // Devolve o que estava escrito antes da remontagem.
  const campo = corpo.querySelector('#chat-texto');
  const guardado = rascunhos.get(modo);
  if (campo && guardado) { campo.value = guardado; ajustarAltura(campo); }

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
        <span class="wa-hora">${hora(m.created_at)}${m.editada_em ? ' · editada' : ''} · ${tempoRestante(m.created_at)}</span>
      </div>
      ${minha ? menuDaMensagem(m.id) : ''}
    </div>`;
}

// Três pontos no canto da própria mensagem. O botão antigo só aparecia no
// hover — que não existe em celular, então apagar era inacessível no aparelho.
function menuDaMensagem(id, podeEditar) {
  return `
    <div class="msg-menu">
      <button class="msg-menu-btn" data-menu="${id}" aria-label="Opções da mensagem">⋯</button>
      <div class="msg-pop" data-pop="${id}" hidden>
        ${podeEditar ? `<button class="msg-pop-item" data-editar="${id}">✏️ Editar</button>` : ''}
        <button class="msg-pop-item" data-apagar="${id}">🗑 Excluir</button>
      </div>
    </div>`;
}

function fecharMenus(exceto) {
  document.querySelectorAll('.msg-pop:not([hidden])').forEach(p => {
    if (p.dataset.pop !== exceto) p.hidden = true;
  });
}

// Os ouvintes são DELEGADOS no #app, que é permanente entre telas — o
// roteador troca o innerHTML, não o elemento. Sem esta trava, cada entrada no
// chat empilhava mais um jogo de ouvintes e a terceira visita enviava a mesma
// mensagem três vezes. Delegado e sem estado, registrar uma vez basta.
function ligarEventos(app) {
  // A marca vai no ELEMENTO, não numa variável do módulo: se um dia o #app
  // passar a ser recriado em vez de ter o innerHTML trocado, a trava se
  // desfaz junto e os ouvintes são registrados de novo, como devem.
  if (app.dataset.chatLigado) return;
  app.dataset.chatLigado = '1';

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

    const menu = t.closest('[data-menu]');
    if (menu) {
      const pop = app.querySelector(`[data-pop="${menu.dataset.menu}"]`);
      const abrir = pop?.hidden;
      fecharMenus();
      if (pop && abrir) pop.hidden = false;
      return;
    }
    // Toque fora fecha o menu aberto.
    if (!t.closest('.msg-pop')) fecharMenus();

    const ed = t.closest('[data-editar]');
    if (ed) {
      fecharMenus();
      const bolha = app.querySelector(`[data-id="${ed.dataset.editar}"] .dc-txt, [data-id="${ed.dataset.editar}"] .wa-txt`);
      const campo = app.querySelector('#chat-texto');
      if (bolha && campo) {
        editando = ed.dataset.editar;
        campo.value = bolha.textContent;
        campo.focus();
        app.querySelector('#chat-envio')?.classList.add('editando');
      }
      return;
    }
    if (t.closest('#chat-cancelar-edicao')) {
      editando = null;
      const c2 = app.querySelector('#chat-texto'); if (c2) c2.value = '';
      app.querySelector('#chat-envio')?.classList.remove('editando');
      return;
    }

    const apagar = t.closest('[data-apagar]');
    if (apagar) {
      const alheia = !apagar.closest('.dc-msg, .wa-msg')?.querySelector('[data-editar]');
      const ok = await confirmModal({
        title: alheia ? 'Apagar mensagem de outra pessoa?' : 'Apagar mensagem?',
        message: alheia
          ? 'Você está apagando como administrador. Ela some para todo mundo.'
          : 'Ela some para todo mundo.',
        confirmText: 'Apagar', cancelText: 'Manter', danger: true,
      });
      if (!ok) return;
      try { await apagarMensagem(apagar.dataset.apagar); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
    }
  });

  // A caixa cresce com o texto. Sem isso a quebra de linha existiria mas a
  // pessoa escreveria às cegas numa fresta de uma linha.
  app.addEventListener('input', (ev) => {
    if (ev.target.id !== 'chat-texto') return;
    ajustarAltura(ev.target);
    guardarRascunho();
  });

  // Enter = quebra de linha (comportamento nativo da textarea, não mexemos).
  // Ctrl/⌘+Enter continua enviando, pra quem escreve no teclado físico.
  app.addEventListener('keydown', (ev) => {
    if (ev.target.id !== 'chat-texto') return;
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      app.querySelector('#chat-envio')?.requestSubmit();
    }
  });

  app.addEventListener('submit', async (ev) => {
    if (!ev.target.closest('#chat-envio')) return;
    ev.preventDefault();
    const campo = app.querySelector('#chat-texto');
    // trim só nas pontas: quebras de linha NO MEIO do texto são conteúdo
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = '';
    ajustarAltura(campo);
    rascunhos.delete(modoAtual());
    try {
      if (editando) {
        await editarMensagem(editando, texto);
        editando = null;
        app.querySelector('#chat-envio')?.classList.remove('editando');
      } else if (aba === 'mural') await enviarNoMural(texto, meuNome);
      else if (conversaCom) await enviarPrivado(conversaCom.id, texto, meuNome);
      await recarregar();
      // A lista só se auto-rola quando já estava no fim. Depois de enviar, a
      // própria mensagem tem que aparecer mesmo pra quem tinha subido a tela.
      const l = document.getElementById('chat-lista');
      if (l) l.scrollTop = l.scrollHeight;
    } catch (e) {
      campo.value = texto;   // devolve o que a pessoa escreveu
      ajustarAltura(campo);
      guardarRascunho();
      showToast(e.message || 'Não deu pra enviar', 'error');
    }
  });
}

// Altura da caixa de escrita = altura do conteúdo, limitada pelo max-height
// do CSS (132px ~ 5 linhas). O zerar antes é obrigatório: sem ele o
// scrollHeight nunca diminui e a caixa só cresce.
const ALTURA_MAX = 132;   // ~5 linhas; igual ao max-height do CSS
function ajustarAltura(el) {
  if (!el) return;
  el.style.height = 'auto';
  const cheio = el.scrollHeight;
  el.style.height = Math.min(cheio, ALTURA_MAX) + 'px';
  // A barra só entra depois que a caixa parou de crescer. Antes disso não há
  // o que rolar, e ela só aparecia atravessada na borda arredondada.
  el.classList.toggle('rolando', cheio > ALTURA_MAX);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const corta = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const inicial = (n) => esc(String(n || 'F').trim().charAt(0).toUpperCase());
const hora = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const erro = (e) => `<div class="chat-vazio">Não deu pra carregar: ${esc(e.message || e)}</div>`;
