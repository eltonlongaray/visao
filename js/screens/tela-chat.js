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
  subirFotoDoChat, assinarFotos, faxinaFotos,
  resumoReacoes, reagir, encaminhar,
} from '../chat.js';
import { bottomNav } from '../components/menu-inferior.js';
import { auth } from '../autenticacao.js';
import { getProfile } from '../banco-dados.js';
import { showToast, confirmModal } from '../aviso-tela.js';
import { CATEGORIAS, recentes, registrarUso } from '../emojis.js';

let aba = 'mural';        // 'mural' | 'privado'
let conversaCom = null;   // { id, nome } quando aberta
let meuNome = 'Falcão';
let recarga = null;       // timer de atualização enquanto a tela está aberta
let editando = null;      // id da mensagem em edição
// Mesma fonte que o RLS usa (profiles.is_admin), não a lista de e-mails do
// app: se as duas divergissem, o botão apareceria e a exclusão falharia.
let souAdmin = false;
let perfis = new Map();   // id -> { nome, foto }, alimentado por fetchPerfis()
let fotos = new Map();    // caminho no bucket -> URL assinada (vale 1h)
let anexo = null;         // { blob, previa } escolhido e ainda não enviado
let reacoes = new Map();  // id da mensagem -> [{ emoji, total, eu }]
let porId = new Map();    // id -> mensagem, pra citação achar a original
let respondendoA = null;  // { id, nome, texto, temFoto } citado no envio

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
// BOTÃO VOLTAR DO APARELHO
// ═══════════════════════════════════════════════════════════════
// A conversa aberta é um ESTADO dentro da tela de chat, não uma rota. Sem
// isto, o voltar do celular saía da tela inteira em vez de devolver para a
// lista — que é o que qualquer app de mensagem faz.
//
// Empurra-se uma entrada no histórico sem mexer na URL: o roteador só reage
// a hashchange, então ele não re-renderiza nada e a volta fica por nossa
// conta. A seta da tela chama history.back() em vez de fechar direto, pra
// não existirem dois caminhos de saída que podem sair de sincronia.
let entradaNoHistorico = false;   // empurrei uma entrada e ela ainda vale?
let entradaOrfa = false;          // saí da tela deixando uma pra trás
let fotoNoHistorico = false;      // visualizador de foto empurrou entrada

function abrirConversa(id, nome) {
  conversaCom = { id, nome };
  history.pushState({ falconConversa: 1 }, '');
  entradaNoHistorico = true;
  return recarregar();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Fora da tela de chat o voltar não é nosso.
    if (!document.getElementById('chat-corpo')) { entradaOrfa = entradaNoHistorico; return; }

    // Foto aberta é o primeiro a fechar: é a camada mais de cima da tela.
    if (fotoNoHistorico) { fecharVisualizador({ voltando: true }); return; }

    // Com mensagem selecionada, o voltar desfaz a seleção e a conversa fica —
    // igual ao WhatsApp. Reponho a entrada pro próximo voltar fechar a conversa.
    if (selecionada) {
      limparSelecao();
      if (conversaCom) history.pushState({ falconConversa: 1 }, '');
      return;
    }
    if (conversaCom) {
      conversaCom = null;
      entradaNoHistorico = false;
      recarregar();
      return;
    }
    // Sobrou uma entrada de quando saí da tela com conversa aberta: ela não
    // representa nada na interface, então passo o voltar adiante em vez de
    // engolir o toque.
    if (entradaOrfa) { entradaOrfa = false; history.back(); }
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ENTRY POINT
// ═══════════════════════════════════════════════════════════════
export async function renderChat(app) {
  app.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted)">Carregando conversas…</div>`;
  meuNome = await meuNomeDeChat();
  try { souAdmin = !!(await getProfile())?.isAdmin; } catch { souAdmin = false; }
  faxinaChat();   // sem await: é limpeza de fundo
  faxinaFotos();  // idem: apaga imagens que perderam a mensagem dona

  desenharCasca(app);
  ajustarConversaAoTeclado();   // dimensiona pela tela visível já na entrada
  await recarregar();

  // Atualiza enquanto a tela estiver aberta. Ao sair, o cleanup do roteador
  // derruba o timer — sem isso ele seguiria batendo no banco pra sempre.
  clearInterval(recarga);
  // A atualização pausa enquanto há mensagem selecionada: reescrever a lista
  // apagaria o destaque e a barra ficaria apontando pra um elemento que não
  // existe mais.
  recarga = setInterval(() => {
    if (selecionada) return;
    if (document.getElementById('chat-corpo')) recarregar();
  }, 12000);
  return () => {
    clearInterval(recarga); recarga = null;
    conversaCom = null;
    limparSelecao();
    limparAnexo();
    // URLs assinadas valem 1h e morrem com a sessão da tela: guardar entre
    // visitas devolveria link vencido na volta
    fotos.clear();
    entradaOrfa = entradaNoHistorico;
    entradaNoHistorico = false;
  };
}

function desenharCasca(app) {
  app.innerHTML = `
    <div class="screen-pad chat-tela">
      <div class="screen-title">
        <h1>🦅 Comunidade Falcon Hunters</h1>
        <div class="sub">As mensagens somem sozinhas depois de 7 dias.</div>
      </div>

      <div class="tab-switch" id="chat-abas">
        <button class="tab-btn ${aba === 'mural' ? 'active' : ''}" data-aba="mural">📣 Comunidade</button>
        <button class="tab-btn ${aba === 'privado' ? 'active' : ''}" data-aba="privado">🔒 Privado</button>
      </div>

      <div id="chat-corpo"></div>
    </div>
    <div class="foto-envio" id="foto-envio" hidden></div>
    <div class="foto-ver" id="foto-ver" hidden></div>
    <div class="chat-selbar" id="chat-selbar" hidden>
      <button class="selbar-x" id="sel-cancelar" aria-label="Cancelar seleção">✕</button>
      <span class="selbar-tit">1 mensagem</span>
      <div class="selbar-acoes">
        <button data-sel-responder aria-label="Responder" title="Responder">↩</button>
        <button data-sel-encaminhar aria-label="Encaminhar" title="Encaminhar">↪</button>
        <button data-sel-copiar aria-label="Copiar" title="Copiar">⧉</button>
        <button data-sel-editar aria-label="Editar" title="Editar">✎</button>
        <button data-sel-apagar aria-label="Excluir" title="Excluir">🗑</button>
      </div>
    </div>
    <div class="reac-barra" id="reac-barra" hidden></div>
    <div class="enc-folha" id="enc-folha" hidden></div>
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
  await carregarFotos(msgs);
  await carregarReacoes(msgs);
  // Mesmo balão do privado. O formato Discord (avatar + nome + texto corrido)
  // não deixava claro o que era meu: numa conversa, quem fala de que lado é a
  // primeira informação que a pessoa lê. Aqui o autor aparece dentro do balão
  // porque no mural são muitas pessoas, não duas.
  const lista = msgs.length
    ? msgs.map((m, i) => separadorDeDia(m, msgs[i - 1]) + balao(m, m.autor_id === meu, true)).join('')
    : `<div class="chat-vazio">Ninguém falou nada ainda.<br>Abre o jogo — a comunidade lê.</div>`;

  pintar(corpo, lista, 'Falar com a comunidade…', '', true);
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
    <div class="dc-msg ${agrupa ? 'dc-cont' : ''}" data-id="${m.id}"
      data-editavel="${minha ? 1 : 0}" data-apagavel="${minha || souAdmin ? 1 : 0}">
      ${agrupa ? '<div class="dc-av"></div>' : avatar(m.autor_id, nome, 'dc-av')}
      <div class="dc-body">${cabecalho}${blocoFoto(m)}${m.texto ? `<div class="dc-txt">${esc(m.texto)}</div>` : ''}</div>
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
  // SEM loading="lazy". Medido no navegador com a URL real: com lazy a
  // imagem fica "pendente" para sempre (currentSrc vazio, complete=false,
  // e NENHUM erro — por isso o sintoma parecia dado ausente); sem lazy ela
  // carrega. O avatar tem ~4 KB e está sempre visível, então adiar não
  // economizava nada. Some com a lista sendo reescrita a cada 12s: o
  // elemento era descartado antes de o navegador decidir buscá-lo.
  //
  // referrerpolicy fica por precaução — não era a causa (o Google devolve
  // 200 com e sem Referer, verificado), mas não custa nada.
  return `<img class="${classe} tem-foto" src="${esc(foto)}" alt=""
    referrerpolicy="no-referrer" decoding="async"
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
  await carregarFotos(msgs);
  await carregarReacoes(msgs);
  const lista = msgs.length
    ? msgs.map((m, i) => separadorDeDia(m, msgs[i - 1]) + balao(m, m.autor_id === meu, false)).join('')
    : `<div class="chat-vazio">Comece a conversa com ${esc(conversaCom.nome)}.</div>`;

  pintar(corpo, lista, `Mensagem para ${conversaCom.nome}…`, `
    <button class="chat-voltar" id="chat-voltar" aria-label="Voltar">
      <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 12H4M11 19l-7-7 7-7"/></svg>
    </button>
    ${avatar(conversaCom.id, conversaCom.nome, 'chat-conv-av')}
    <span class="chat-titulo-conv">${esc(conversaCom.nome)}</span>`);
}

// ═══════════════════════════════════════════════════════════════
// FOTO NA MENSAGEM
// ═══════════════════════════════════════════════════════════════
const FOTO_LADO_MAX = 1600;   // reduz antes de subir: a câmera manda vários MB

// Recorta nada, só encolhe o lado maior. Cortar foto de conversa seria
// decidir pela pessoa o que importa na imagem.
function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, FOTO_LADO_MAX / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * escala);
      cv.height = Math.round(im.height * escala);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('Não deu pra processar a imagem')),
                'image/jpeg', 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Arquivo de imagem inválido')); };
    im.src = url;
  });
}

// A URL assinada vem do mapa `fotos`. Enquanto ela não chegou, o espaço fica
// reservado com a mesma proporção — sem isso a lista pula quando a imagem
// carrega e a pessoa perde a linha que estava lendo.
function blocoFoto(m) {
  if (!m.imagem_path) return '';
  const url = fotos.get(m.imagem_path);
  if (!url) return `<div class="msg-foto msg-foto-vazia"></div>`;
  // Sem botão de baixar aqui: ele fica no visualizador, ao abrir a foto.
  // Pendurado na miniatura, tapava justamente o canto da imagem.
  // Sem botão de curtir aqui: reagir é gesto (segurar a mensagem), como no
  // WhatsApp. Um coração fixo em toda foto polui e sugere uma reação só.
  return `<button type="button" class="msg-foto" data-abrir-foto="${esc(url)}"
    aria-label="Abrir foto">
    <img src="${esc(url)}" alt="Foto enviada na conversa" decoding="async" />
  </button>`;
}

// Assina só o que ainda não tem URL viva. A lista se redesenha de 12 em 12
// segundos e reassinar tudo a cada volta seria uma chamada por ciclo à toa.
// Curtidas e comentários só existem em mensagem com foto por enquanto —
// buscar para as de texto seria consulta à toa.
async function carregarReacoes(msgs) {
  porId = new Map((msgs || []).map(m => [m.id, m]));
  const ids = (msgs || []).map(m => m.id);
  if (!ids.length) { reacoes = new Map(); return; }
  reacoes = await resumoReacoes(ids);
}

async function carregarFotos(msgs) {
  const faltando = (msgs || [])
    .map(m => m.imagem_path)
    .filter(c => c && !fotos.has(c));
  if (!faltando.length) return;
  const novas = await assinarFotos(faltando);
  novas.forEach((url, caminho) => fotos.set(caminho, url));
}

// Tela cheia com a foto, campo de legenda e ENVIAR — o fluxo do WhatsApp.
// A barrinha de prévia anterior obrigava a escrever no campo lá embaixo e
// mandava no ➤ comum: não ficava claro que aquele texto era legenda da foto.
function mostrarPrevia() {
  const tela = document.getElementById('foto-envio');
  if (!tela) return;
  tela.hidden = !anexo;
  document.body.classList.toggle('sem-rolagem', !!anexo);
  if (!anexo) { tela.innerHTML = ''; return; }
  // A barra de legenda flutua SOBRE a foto: ela é parte da mesma coisa que
  // vai ser enviada, e não um passo seguinte. Assim a pessoa escreve e manda
  // sem sair de cima da imagem.
  tela.innerHTML = `
    <button type="button" class="fe-x" id="fe-cancelar" aria-label="Cancelar">✕</button>
    <div class="fe-palco"><img src="${anexo.previa}" alt="Foto escolhida" /></div>
    <div class="fe-baixo">
      <textarea id="fe-legenda" rows="1" maxlength="2000"
        placeholder="Adicione uma legenda…">${esc(anexo.legenda || '')}</textarea>
      <button type="button" class="fe-enviar" id="fe-enviar" aria-label="Enviar">➤</button>
    </div>`;
  tela.querySelector('#fe-legenda')?.focus();
}

// Sem sinal de "estou enviando", subir uma foto em rede ruim parece que não
// fez nada — e a pessoa toca em enviar de novo, e de novo. Foi exatamente o
// que aconteceu no teste: três tentativas até aparecer algum retorno.
function marcarEnviando(ligado) {
  const form = document.getElementById('chat-envio');
  const botao = form?.querySelector('.chat-enviar');
  const previa = document.getElementById('foto-envio');
  if (form) form.classList.toggle('enviando', ligado);
  if (botao) {
    botao.disabled = ligado;              // trava o toque repetido
    botao.textContent = ligado ? '⏳' : '➤';
  }
  const botaoFe = document.getElementById('fe-enviar');
  if (botaoFe) { botaoFe.disabled = ligado; botaoFe.textContent = ligado ? '⏳' : '➤'; }
  if (previa && ligado) previa.classList.add('enviando');
}

// ═══════════════════════════════════════════════════════════════
// RESPONDER · ENCAMINHAR · CATÁLOGO DE REAÇÃO
// ═══════════════════════════════════════════════════════════════
let encaminhando = null;

// Faixa acima do campo mostrando a quem estou respondendo. Sem ela, depois
// de escolher "responder" nada mudaria na tela e a pessoa mandaria a
// mensagem sem saber que ia sair como resposta.
function pintarRespondendo() {
  const box = document.getElementById('chat-respondendo');
  if (!box) return;
  box.hidden = !respondendoA;
  box.innerHTML = respondendoA ? `
    <span class="cita-barra"></span>
    <span class="cita-txt">
      <span class="cita-nome">${esc(respondendoA.nome)}</span>
      <span class="cita-linha">${respondendoA.temFoto ? '📷 ' : ''}${esc(corta(respondendoA.texto || 'Foto', 46))}</span>
    </span>
    <button type="button" class="resp-x" id="resp-cancelar" aria-label="Cancelar resposta">✕</button>` : '';
}

async function abrirEncaminhar(msg) {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  encaminhando = msg;
  folha.hidden = false;
  folha.innerHTML = `<div class="enc-fundo" id="enc-fundo"></div>
    <div class="enc-caixa"><div class="cf-carregando">Carregando…</div></div>`;
  let membros = [];
  try { membros = await fetchMembros(); } catch (e) { showToast(e.message, 'error'); }
  folha.innerHTML = `
    <div class="enc-fundo" id="enc-fundo"></div>
    <div class="enc-caixa">
      <div class="cf-puxador"></div>
      <div class="cf-titulo">Encaminhar para</div>
      <div class="enc-lista">
        ${membros.length ? membros.map(m => `
          <button type="button" class="chat-conv" data-encaminhar-para="${m.user_id}"
            data-nome="${esc(m.nome)}">
            ${avatar(m.user_id, m.nome, 'chat-conv-av')}
            <span class="chat-conv-txt"><span class="chat-conv-nome">${esc(m.nome)}</span></span>
          </button>`).join('')
          : '<div class="cf-vazio">Ninguém mais por aqui ainda.</div>'}
      </div>
    </div>`;
}

function fecharEncaminhar() {
  const folha = document.getElementById('enc-folha');
  encaminhando = null;
  if (!folha) return;
  folha.hidden = true; folha.innerHTML = '';
}

// Reaproveita o catálogo do teclado de emoji: manter duas listas separadas
// faria uma sair da outra com o tempo.
function abrirCatalogoReacao(msgId) {
  if (!msgId) return;
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  folha.hidden = false;
  const todos = CATEGORIAS.filter(c => c.id !== 'recentes')
    .flatMap(c => c.itens).slice(0, 160);
  folha.innerHTML = `
    <div class="enc-fundo" id="rc-fundo"></div>
    <div class="enc-caixa">
      <div class="cf-puxador"></div>
      <div class="cf-titulo">Reagir</div>
      <div class="rc-grade">
        ${todos.map(e => `<button type="button" class="emoji-item"
          data-emoji-reac="${e}" data-msg-reac="${msgId}">${e}</button>`).join('')}
      </div>
    </div>`;
}

function fecharCatalogoReacao() {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  folha.hidden = true; folha.innerHTML = '';
}

// Visualizador em tela cheia. O botão de baixar mora AQUI, no topo — na
// miniatura ele tapava o canto da imagem e só atrapalhava a leitura.
function verFoto(url) {
  const tela = document.getElementById('foto-ver');
  if (!tela) return;
  tela.hidden = false;
  // Entrada própria no histórico: sem ela, o voltar do aparelho saía da
  // conversa inteira em vez de apenas fechar a foto que está aberta.
  history.pushState({ falconFoto: 1 }, '');
  fotoNoHistorico = true;
  document.body.classList.add('sem-rolagem');
  tela.innerHTML = `
    <div class="fv-topo">
      <button type="button" class="fv-btn" id="fv-fechar" aria-label="Fechar">✕</button>
      <a class="fv-btn" href="${esc(url)}" download="falcon-foto.jpg"
        target="_blank" rel="noopener" aria-label="Baixar foto">⤓</a>
    </div>
    <div class="fv-palco"><img src="${esc(url)}" alt="Foto em tela cheia" /></div>`;
}

function fecharVisualizador({ voltando = false } = {}) {
  const tela = document.getElementById('foto-ver');
  if (!tela) return;
  // Fechar pelo ✕ consome a entrada do histórico; se veio do popstate ela
  // já foi consumida e chamar back() de novo sairia da conversa.
  if (fotoNoHistorico && !voltando) { fotoNoHistorico = false; history.back(); return; }
  fotoNoHistorico = false;
  tela.hidden = true;
  tela.innerHTML = '';
  document.body.classList.remove('sem-rolagem');
}

function limparAnexo() {
  if (anexo?.previa) URL.revokeObjectURL(anexo.previa);
  anexo = null;
  mostrarPrevia();
}

// ═══════════════════════════════════════════════════════════════
// SELETOR DE EMOJI
// ═══════════════════════════════════════════════════════════════
// Abrir o seletor FECHA o teclado do sistema (e vice-versa) — os dois
// disputariam o mesmo espaço no rodapé e a conversa sumiria atrás deles.
// É o que o botão faz alternando entre a carinha e o ícone de teclado.
let abaEmoji = 'rostos';

function montarEmojis() {
  const painel = document.getElementById('chat-emojis');
  if (!painel) return;
  const cats = CATEGORIAS.map(c => c.id === 'recentes' ? { ...c, itens: recentes() } : c);
  const atual = cats.find(c => c.id === abaEmoji) || cats[1];

  painel.innerHTML = `
    <div class="emoji-grade">
      ${atual.itens.length
        ? atual.itens.map(e => `<button type="button" class="emoji-item" data-emoji="${e}">${e}</button>`).join('')
        : '<div class="emoji-vazio">Os que você mais usar aparecem aqui.</div>'}
    </div>
    <div class="emoji-abas">
      ${cats.map(c => `<button type="button" class="emoji-aba ${c.id === atual.id ? 'ativa' : ''}"
          data-emoji-aba="${c.id}" aria-label="${c.nome}">${c.icone}</button>`).join('')}
    </div>`;
}

function alternarEmojis(mostrar) {
  const painel = document.getElementById('chat-emojis');
  const btn = document.getElementById('chat-emoji-btn');
  const campo = document.getElementById('chat-texto');
  if (!painel || !btn) return;
  const abrir = mostrar ?? painel.hidden;
  if (abrir) montarEmojis();
  painel.hidden = !abrir;
  btn.textContent = abrir ? '⌨️' : '🙂';
  if (abrir) campo?.blur();
  else campo?.focus();
}

// Insere no CURSOR, não no fim: quem volta pra corrigir o meio da frase
// esperaria o emoji ali, e não grudado no final do texto.
function inserirEmoji(emoji) {
  const campo = document.getElementById('chat-texto');
  if (!campo) return;
  const ini = campo.selectionStart ?? campo.value.length;
  const fim = campo.selectionEnd ?? ini;
  campo.value = campo.value.slice(0, ini) + emoji + campo.value.slice(fim);
  const pos = ini + emoji.length;
  try { campo.setSelectionRange(pos, pos); } catch {}
  ajustarAltura(campo);
  guardarRascunho();
  registrarUso(emoji);
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

function pintar(corpo, lista, placeholder, cabecalho = '', comFundo = false) {
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
    <div class="chat-lista ${cabecalho || comFundo ? 'wa-fundo' : ''}" id="chat-lista">${lista}</div>
    <div class="chat-midia" id="chat-midia" hidden>
      <button type="button" class="midia-op" data-midia="camera">
        <span class="midia-ic">📷</span><span>Câmera</span>
      </button>
      <button type="button" class="midia-op" data-midia="galeria">
        <span class="midia-ic">🖼️</span><span>Galeria</span>
      </button>
    </div>
    <div class="chat-respondendo" id="chat-respondendo" hidden></div>
    <form class="chat-envio" id="chat-envio">
      <div class="chat-campo">
        <button type="button" class="chat-emoji-btn" id="chat-emoji-btn"
          aria-label="Emojis">🙂</button>
        <textarea id="chat-texto" placeholder="${esc(placeholder)}" maxlength="2000"
          rows="1" autocomplete="off" enterkeyhint="enter"></textarea>
        <button type="button" class="chat-foto-btn" id="chat-foto-btn"
          aria-label="Enviar foto" title="Enviar foto">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
            stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.8A1.5 1.5 0 0 1 9.1 4.5h5.8a1.5 1.5 0 0 1 1.3.7L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>
            <circle cx="12" cy="12.8" r="3.4"/>
          </svg>
        </button>
      </div>
      <!-- Dois campos, não um: 'capture' abre a câmera direto e a AUSÊNCIA
           dele abre a galeria. Não dá pra ter os dois no mesmo input, por
           isso a escolha aparece antes. -->
      <input type="file" id="chat-foto-camera" accept="image/*" capture="environment" hidden />
      <input type="file" id="chat-foto-galeria" accept="image/*" hidden />
      <button type="button" class="chat-cancelar-ed" id="chat-cancelar-edicao" aria-label="Cancelar edição">✕</button>
      <button type="submit" class="chat-enviar" aria-label="Enviar">➤</button>
    </form>
    <div class="chat-emojis" id="chat-emojis" hidden></div>`;

  corpo.innerHTML = cabecalho ? `<div class="chat-cheia">${corpoHtml}</div>` : corpoHtml;
  corpo.dataset.modo = modo;

  // Devolve o que estava escrito antes da remontagem.
  const campo = corpo.querySelector('#chat-texto');
  const guardado = rascunhos.get(modo);
  if (campo && guardado) { campo.value = guardado; ajustarAltura(campo); }

  const l = corpo.querySelector('#chat-lista');
  if (l) l.scrollTop = l.scrollHeight;
  if (cabecalho) ajustarConversaAoTeclado();   // o teclado pode já estar aberto
  // O botão de enviar mudou de lugar; o pet precisa se reposicionar.
  pintarRespondendo();
  window.dispatchEvent(new Event('falcon:layout'));
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

// Reações agrupadas embaixo do balão: "👍3 ❤️2". A minha vem destacada pra
// eu saber, de relance, se já reagi — e em qual.
function fitaReacoes(m) {
  const lista = reacoes.get(m.id);
  if (!lista?.length) return '';
  return `<div class="reac-fita">${lista.map(r => `
    <button type="button" class="reac-chip ${r.eu ? 'minha' : ''}"
      data-reagir="${m.id}" data-emoji="${esc(r.emoji)}">
      ${esc(r.emoji)}${r.total > 1 ? `<span>${r.total}</span>` : ''}
    </button>`).join('')}</div>`;
}

// Citação da mensagem respondida. Toca nela e a lista rola até a original —
// sem isso a resposta vira um recorte sem contexto quando a conversa cresce.
function citacao(m) {
  if (!m.responde_a) return '';
  const orig = porId.get(m.responde_a);
  if (!orig) return `<div class="cita cita-sumiu">Mensagem apagada</div>`;
  const url = orig.imagem_path ? fotos.get(orig.imagem_path) : null;
  return `<button type="button" class="cita" data-ir-para="${orig.id}">
    <span class="cita-barra"></span>
    <span class="cita-txt">
      <span class="cita-nome" style="color:${corDe(orig.autor_id)}">${esc(orig.autor_nome || 'Falcão')}</span>
      <span class="cita-linha">${orig.imagem_path ? '📷 ' : ''}${esc(corta(orig.texto || 'Foto', 46))}</span>
    </span>
    ${url ? `<img class="cita-mini" src="${esc(url)}" alt="" />` : ''}
  </button>`;
}

function balao(m, minha, mostrarAutor) {
  // Estilo WhatsApp: a hora vai DENTRO da bolha, no canto de baixo. Fora dela
  // cada mensagem ganhava uma linha extra e a conversa ficava esparramada.
  return `
    <div class="wa-msg ${minha ? 'minha' : ''} ${m.imagem_path ? 'wa-com-foto' : ''}" data-id="${m.id}"
      data-editavel="${minha ? 1 : 0}" data-apagavel="${minha ? 1 : 0}">
      <div class="wa-bolha ${m.imagem_path ? 'bolha-foto' : ''}">
        ${mostrarAutor && !minha ? `<span class="wa-autor">${esc(m.autor_nome || 'Falcão')}</span>` : ''}
        ${citacao(m)}
        ${blocoFoto(m)}
        ${m.texto ? `<span class="wa-txt">${esc(m.texto)}</span>` : ''}
        <span class="wa-hora">${hora(m.created_at)}${m.editada_em ? ' · editada' : ''} · ${tempoRestante(m.created_at)}</span>
      </div>
      ${fitaReacoes(m)}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SELEÇÃO DE MENSAGEM — segurar abre a barra de ações no topo
// ═══════════════════════════════════════════════════════════════
// Era um ⋯ pendurado na lateral de cada mensagem: ocupava espaço em TODAS
// as linhas por causa de uma ação que quase nunca é usada, e desalinhava as
// bolhas. No padrão do WhatsApp a mensagem não carrega botão nenhum — segura
// em cima dela e as ações aparecem numa barra no topo da tela.
let selecionada = null;   // { id, editavel, apagavel, texto }
let engolirClique = false;   // ver o handler de clique: o clique do próprio gesto

function selecionarMensagem(el) {
  document.querySelectorAll('.msg-sel').forEach(e => e.classList.remove('msg-sel'));
  el.classList.add('msg-sel');
  selecionada = {
    id: el.dataset.id,
    editavel: el.dataset.editavel === '1',
    apagavel: el.dataset.apagavel === '1',
    texto: el.querySelector('.dc-txt, .wa-txt')?.textContent || '',
  };
  pintarBarraSelecao();
  engolirClique = true;
  // Confirmação tátil: sem ela não fica claro que o "segurar" pegou.
  try { navigator.vibrate?.(12); } catch {}
}

function limparSelecao() {
  selecionada = null;
  document.querySelectorAll('.msg-sel').forEach(e => e.classList.remove('msg-sel'));
  pintarBarraSelecao();
}

// Sete atalhos + "…" pro catálogo completo, como no WhatsApp. Os sete são os
// que cobrem quase todo uso real; obrigar a abrir o catálogo pra dar um 👍
// transformaria um gesto em três toques.
const REAC_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '💪'];

function pintarBarraSelecao() {
  const barra = document.getElementById('chat-selbar');
  const fita = document.getElementById('reac-barra');
  if (!barra) return;
  barra.hidden = !selecionada;
  if (fita) {
    fita.hidden = !selecionada;
    if (selecionada) {
      const minha = (reacoes.get(selecionada.id) || []).find(r => r.eu)?.emoji || null;
      fita.innerHTML = REAC_RAPIDAS.map(e => `
        <button type="button" class="rb-item ${e === minha ? 'ativa' : ''}"
          data-reagir="${selecionada.id}" data-emoji="${e}">${e}</button>`).join('')
        + `<button type="button" class="rb-item rb-mais" id="rb-mais" aria-label="Mais emojis">＋</button>`;
    } else { fita.innerHTML = ''; }
  }
  if (!selecionada) return;
  barra.querySelector('[data-sel-editar]').hidden = !selecionada.editavel;
  barra.querySelector('[data-sel-apagar]').hidden = !selecionada.apagavel;
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
    // Volta pelo history, não direto: assim a seta da tela e o botão físico
    // do aparelho passam pelo MESMO caminho e não saem de sincronia.
    if (t.closest('#chat-voltar')) { history.back(); return; }

    const conv = t.closest('[data-abrir]');
    if (conv) return abrirConversa(conv.dataset.abrir, conv.dataset.nome);

    if (selecionada && !t.closest('.chat-selbar')) {
      // Em modo de seleção, tocar em OUTRA mensagem troca a seleção em vez
      // de sair dele — é o que o WhatsApp faz.
      const outra = t.closest('.dc-msg, .wa-msg');
      if (outra?.dataset.id && outra.dataset.id !== selecionada.id) {
        selecionarMensagem(outra);
        return;
      }
      // Soltar o dedo depois de segurar dispara um clique logo atrás da
      // seleção. Sem engolir esse primeiro clique, a barra abria e fechava
      // no mesmo gesto.
      if (engolirClique) { engolirClique = false; return; }
      limparSelecao();
      return;
    }

    // ── reagir (fita da seleção OU chip embaixo da mensagem) ──
    const btnReagir = t.closest('[data-reagir]');
    if (btnReagir) {
      const id = btnReagir.dataset.reagir;
      const emoji = btnReagir.dataset.emoji;
      const atual = (reacoes.get(id) || []).find(r => r.eu)?.emoji || null;
      limparSelecao();
      try { await reagir(id, emoji, atual); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
      return;
    }
    if (t.closest('#rb-mais')) {
      // catálogo completo, reaproveitando o mesmo seletor do teclado
      const alvo = selecionada?.id;
      limparSelecao();
      abrirCatalogoReacao(alvo);
      return;
    }
    const emjReac = t.closest('[data-emoji-reac]');
    if (emjReac) {
      const id = emjReac.dataset.msgReac;
      const atual = (reacoes.get(id) || []).find(r => r.eu)?.emoji || null;
      fecharCatalogoReacao();
      try { await reagir(id, emjReac.dataset.emojiReac, atual); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
      return;
    }
    if (t.closest('#rc-fundo')) { fecharCatalogoReacao(); return; }

    // ── responder ──
    if (t.closest('[data-sel-responder]') && selecionada) {
      const m = porId.get(selecionada.id);
      respondendoA = m ? { id: m.id, nome: m.autor_nome || 'Falcão',
                           texto: m.texto || '', temFoto: !!m.imagem_path } : null;
      limparSelecao();
      pintarRespondendo();
      app.querySelector('#chat-texto')?.focus();
      return;
    }
    if (t.closest('#resp-cancelar')) { respondendoA = null; pintarRespondendo(); return; }

    // ── ir até a mensagem citada ──
    const irPara = t.closest('[data-ir-para]');
    if (irPara) {
      const alvo = app.querySelector(`.wa-msg[data-id="${irPara.dataset.irPara}"]`);
      if (alvo) {
        alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alvo.classList.add('piscando');
        setTimeout(() => alvo.classList.remove('piscando'), 1400);
      } else { showToast('Essa mensagem já saiu da conversa.', 'info'); }
      return;
    }

    // ── encaminhar ──
    if (t.closest('[data-sel-encaminhar]') && selecionada) {
      const m = porId.get(selecionada.id);
      limparSelecao();
      if (m) await abrirEncaminhar(m);
      return;
    }
    if (t.closest('#enc-fundo')) { fecharEncaminhar(); return; }
    const encPara = t.closest('[data-encaminhar-para]');
    if (encPara) {
      const alvo = encPara.dataset.encaminharPara;
      const nomeAlvo = encPara.dataset.nome;
      const m = encaminhando;
      fecharEncaminhar();
      try { await encaminhar(m, alvo, meuNome); showToast(`Enviado para ${nomeAlvo}.`, 'success'); }
      catch (e) { showToast(e.message, 'error'); }
      return;
    }

    const abrirFoto = t.closest('[data-abrir-foto]');
    if (abrirFoto) { verFoto(abrirFoto.dataset.abrirFoto); return; }
    if (t.closest('#fv-fechar')) { fecharVisualizador(); return; }
    if (t.closest('#fe-cancelar')) { limparAnexo(); return; }
    if (t.closest('#fe-enviar')) { app.querySelector('#chat-envio')?.requestSubmit(); return; }

    if (t.closest('#chat-foto-btn')) {
      const folha = app.querySelector('#chat-midia');
      if (folha) folha.hidden = !folha.hidden;
      return;
    }
    const opMidia = t.closest('[data-midia]');
    if (opMidia) {
      app.querySelector('#chat-midia').hidden = true;
      const alvo = opMidia.dataset.midia === 'camera' ? '#chat-foto-camera' : '#chat-foto-galeria';
      app.querySelector(alvo)?.click();
      return;
    }
    // toque fora fecha a folha de mídia
    if (!t.closest('.chat-midia')) {
      const folha = app.querySelector('#chat-midia');
      if (folha && !folha.hidden) folha.hidden = true;
    }
    if (t.closest('#previa-remover')) { limparAnexo(); return; }

    if (t.closest('#chat-emoji-btn')) { alternarEmojis(); return; }

    const abaEmj = t.closest('[data-emoji-aba]');
    if (abaEmj) { abaEmoji = abaEmj.dataset.emojiAba; montarEmojis(); return; }

    const emj = t.closest('[data-emoji]');
    if (emj) { inserirEmoji(emj.dataset.emoji); return; }

    // Tocar no campo de texto devolve o teclado do sistema. Só age se o
    // seletor estiver aberto — senão cada toque no campo viraria um
    // blur/focus à toa, e no aparelho isso pisca o teclado.
    if (t.closest('#chat-texto')) {
      const painel = document.getElementById('chat-emojis');
      if (painel && !painel.hidden) alternarEmojis(false);
      return;
    }

    if (t.closest('#sel-cancelar')) { limparSelecao(); return; }

    if (t.closest('[data-sel-copiar]') && selecionada) {
      const texto = selecionada.texto;
      limparSelecao();
      try { await navigator.clipboard.writeText(texto); showToast('Copiado.', 'info'); }
      catch { showToast('Seu navegador não deixou copiar.', 'error'); }
      return;
    }

    if (t.closest('[data-sel-editar]') && selecionada?.editavel) {
      const campo = app.querySelector('#chat-texto');
      if (campo) {
        editando = selecionada.id;
        campo.value = selecionada.texto;
        ajustarAltura(campo);
        campo.focus();
        app.querySelector('#chat-envio')?.classList.add('editando');
      }
      limparSelecao();
      return;
    }
    if (t.closest('#chat-cancelar-edicao')) {
      editando = null;
      const c2 = app.querySelector('#chat-texto'); if (c2) c2.value = '';
      app.querySelector('#chat-envio')?.classList.remove('editando');
      return;
    }

    if (t.closest('[data-sel-apagar]') && selecionada?.apagavel) {
      // Alheia = eu posso apagar mas não editar, e isso só acontece via
      // privilégio de administrador.
      const alheia = !selecionada.editavel;
      const id = selecionada.id;
      limparSelecao();
      const ok = await confirmModal({
        title: alheia ? 'Apagar mensagem de outra pessoa?' : 'Apagar mensagem?',
        message: alheia
          ? 'Você está apagando como administrador. Ela some para todo mundo.'
          : 'Ela some para todo mundo.',
        confirmText: 'Apagar', cancelText: 'Manter', danger: true,
      });
      if (!ok) return;
      try { await apagarMensagem(id); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
    }
  });

  // ── Segurar em cima da mensagem seleciona (padrão WhatsApp) ──
  // 450ms: abaixo disso um toque comum às vezes conta como "segurar".
  let pressTimer = null, pressDe = null;
  const soltarPress = () => { clearTimeout(pressTimer); pressTimer = null; pressDe = null; };

  app.addEventListener('pointerdown', (ev) => {
    const msg = ev.target.closest('.dc-msg, .wa-msg');
    if (!msg || !msg.dataset.id) return;
    pressDe = { x: ev.clientX, y: ev.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { pressTimer = null; selecionarMensagem(msg); }, 450);
  });
  app.addEventListener('pointerup', soltarPress);
  app.addEventListener('pointercancel', soltarPress);
  // Rolar a lista não pode virar seleção: qualquer arraste cancela.
  app.addEventListener('pointermove', (ev) => {
    if (!pressTimer || !pressDe) return;
    if (Math.abs(ev.clientX - pressDe.x) > 10 || Math.abs(ev.clientY - pressDe.y) > 10) soltarPress();
  });
  // No aparelho, segurar dispara o menu nativo de seleção de texto por cima
  // do nosso. No computador, é o clique direito que abre a mesma barra.
  app.addEventListener('contextmenu', (ev) => {
    const msg = ev.target.closest('.dc-msg, .wa-msg');
    if (!msg || !msg.dataset.id) return;
    ev.preventDefault();
    selecionarMensagem(msg);
  });

  app.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'chat-foto-camera' && ev.target.id !== 'chat-foto-galeria') return;
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';   // permite reescolher o MESMO arquivo depois
    if (!arquivo) return;
    try {
      limparAnexo();
      const blob = await reduzirImagem(arquivo);
      anexo = { blob, previa: URL.createObjectURL(blob) };
      mostrarPrevia();
    } catch (e) { showToast(e.message || 'Não deu pra abrir a imagem', 'error'); }
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
    // Com foto escolhida, o que vale é a legenda da tela cheia — o campo de
    // baixo está atrás dela e pode ter um rascunho de outra mensagem.
    const legenda = app.querySelector('#fe-legenda');
    const texto = (anexo && legenda ? legenda.value : campo.value).trim();
    // foto sozinha é mensagem válida; texto vazio sem foto, não
    if (!texto && !anexo) return;
    // editar não mexe na imagem (o banco também rejeita), então some com o anexo
    if (editando && anexo) limparAnexo();

    const paraEnviar = anexo;
    if (!paraEnviar) {
      campo.value = '';
      ajustarAltura(campo);
      rascunhos.delete(modoAtual());
    }
    // A tela da legenda fica ABERTA durante o envio: é nela que o botão vira
    // ⏳. Fechar antes deixava a pessoa sem nenhum sinal de que algo estava
    // acontecendo — que foi o que gerou os envios repetidos no teste.
    if (paraEnviar) { paraEnviar.legenda = texto; marcarEnviando(true); }
    try {
      // a imagem sobe ANTES: se falhar, não nasce mensagem apontando pra
      // arquivo que não existe, e o texto volta pro campo intacto
      const caminho = paraEnviar ? await subirFotoDoChat(paraEnviar.blob) : null;
      if (editando) {
        await editarMensagem(editando, texto);
        editando = null;
        app.querySelector('#chat-envio')?.classList.remove('editando');
      } else if (aba === 'mural') await enviarNoMural(texto, meuNome, caminho, respondendoA?.id || null);
      else if (conversaCom) await enviarPrivado(conversaCom.id, texto, meuNome, caminho, respondendoA?.id || null);
      if (paraEnviar) limparAnexo();   // só fecha depois que deu certo
      respondendoA = null; pintarRespondendo();
      await recarregar();
      // A lista só se auto-rola quando já estava no fim. Depois de enviar, a
      // própria mensagem tem que aparecer mesmo pra quem tinha subido a tela.
      const l = document.getElementById('chat-lista');
      if (l) l.scrollTop = l.scrollHeight;
    } catch (e) {
      if (!paraEnviar) {
        campo.value = texto;   // devolve o que a pessoa escreveu
        ajustarAltura(campo);
        guardarRascunho();
      }
      // a foto e a legenda continuam ali: perder a imagem escolhida por uma
      // falha de rede obrigaria a pessoa a procurá-la na galeria de novo
      showToast(e.message || 'Não deu pra enviar', 'error');
    } finally {
      marcarEnviando(false);
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
