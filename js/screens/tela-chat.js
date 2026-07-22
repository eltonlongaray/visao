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
  subirFotoDoChat, assinarFotos, faxinaFotos, espelharFotoDoGoogle,
  resumoReacoes, reagir, encaminhar, quemReagiu,
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

  // A barra de legenda fica no rodapé de uma tela cheia, que não encolhe com
  // o teclado — sobrava uma faixa preta entre as duas. Aqui ela sobe junto.
  const feBaixo = document.querySelector('.fe-baixo');
  if (feBaixo) feBaixo.style.bottom = teclado < 80 ? '' : teclado + 'px';
  const fvBaixo = document.querySelector('.fv-baixo');
  if (fvBaixo) fvBaixo.style.bottom = teclado < 80 ? '' : teclado + 'px';
}

// A fita de reação é `position: fixed`, então rolar a lista a deixava parada
// enquanto a mensagem subia — e ela passava a apontar pra mensagem errada.
if (typeof document !== 'undefined') {
  document.addEventListener('scroll', () => {
    const uma = umaSo();
    if (uma) posicionarFitaReacao(uma.id);
  }, true);   // captura: o scroll acontece na lista, não na janela
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
let fotoAberta = null;            // { url, msgId } da foto em tela cheia

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
    if (selecionados.size) {
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
  espelharFotoDoGoogle();   // uma vez só: traz a foto do Google pro nosso bucket

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
    if (selecionados.size) return;
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
    <div class="cam-tela" id="cam-tela" hidden>
      <video id="cam-video" autoplay playsinline muted></video>
      <button type="button" class="cam-btn cam-x" id="cam-fechar" aria-label="Fechar">✕</button>
      <button type="button" class="cam-btn cam-virar" id="cam-virar" aria-label="Virar câmera">⟲</button>
      <div class="cam-baixo">
        <button type="button" class="cam-btn cam-lado" id="cam-galeria" aria-label="Galeria">🖼</button>
        <button type="button" class="cam-disparo" id="cam-disparo" aria-label="Tirar foto"></button>
        <span class="cam-lado"></span>
      </div>
    </div>
    <div class="foto-envio" id="foto-envio" hidden></div>
    <div class="foto-ver" id="foto-ver" hidden></div>
    <div class="chat-selbar" id="chat-selbar" hidden>
      <button class="selbar-x" id="sel-cancelar" aria-label="Cancelar seleção">✕</button>
      <span class="selbar-tit">1 mensagem</span>
      <div class="selbar-acoes">
        <button data-sel-responder aria-label="Responder" title="Responder">${IC_RESP}</button>
        <button data-sel-encaminhar aria-label="Encaminhar" title="Encaminhar">${IC_ENCAM}</button>
        <button data-sel-copiar aria-label="Copiar" title="Copiar">${IC_COPIAR}</button>
        <button data-sel-editar aria-label="Editar" title="Editar">${IC_EDITAR}</button>
        <button data-sel-apagar aria-label="Excluir" title="Excluir">${IC_LIXO}</button>
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

  pintar(corpo, lista, 'Escrever mensagem', '', true);
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

  pintar(corpo, lista, 'Escrever mensagem', `
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
      <div class="fe-campo">
        <button type="button" class="fe-emoji" id="fe-emoji" aria-label="Emojis">🙂</button>
        <textarea id="fe-legenda" rows="1" maxlength="2000"
          placeholder="Adicione uma legenda…">${esc(anexo.legenda || '')}</textarea>
      </div>
      <button type="button" class="fe-enviar" id="fe-enviar" aria-label="Enviar">${IC_ENVIAR}</button>
    </div>`;
  // SEM focus() automático: abrir a foto com o teclado já em cima tapa metade
  // da imagem que a pessoa acabou de tirar. O teclado sobe quando ela tocar
  // no campo.
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

// Marcação por bolinha, como no WhatsApp: dá pra escolher várias pessoas de
// uma vez e ainda mandar um texto junto do que está sendo encaminhado.
let encAlvos = new Set();

const IC_ENVIAR = '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15.5 12 3.4 13.9z"/></svg>';

// Miniatura do que está sendo encaminhado, DENTRO da caixa de escrever: sem
// ela a pessoa escreve sem ver o que vai junto, e com várias mensagens
// selecionadas nem lembra quais eram.
function miniaturaEncaminhada() {
  const msgs = encaminhando || [];
  if (!msgs.length) return '';
  const primeira = msgs[0];
  const url = primeira.imagem_path ? fotos.get(primeira.imagem_path) : null;
  const extra = msgs.length > 1 ? `<span class="enc-mini-n">+${msgs.length - 1}</span>` : '';
  if (url) return `<span class="enc-mini">${extra}<img src="${esc(url)}" alt="" /></span>`;
  return `<span class="enc-mini enc-mini-txt">${extra}${esc(corta(primeira.texto || 'Mensagem', 24))}</span>`;
}

async function abrirEncaminhar(msgs) {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  encaminhando = Array.isArray(msgs) ? msgs : [msgs];
  encAlvos = new Set();
  folha.hidden = false;
  folha.innerHTML = `<div class="enc-fundo" id="enc-fundo"></div>
    <div class="enc-caixa"><div class="cf-carregando">Carregando…</div></div>`;
  let membros = [];
  try { membros = await fetchMembros(); } catch (e) { showToast(e.message, 'error'); }
  folha.innerHTML = `
    <div class="enc-fundo" id="enc-fundo"></div>
    <div class="enc-caixa">
      <div class="cf-puxador"></div>
      <div class="cf-titulo">Encaminhar para…</div>
      <input class="chat-busca enc-busca" id="enc-filtro" placeholder="Buscar pessoa…" autocomplete="off" />
      <div class="enc-lista" id="enc-lista">
        ${membros.length ? membros.map(m => `
          <button type="button" class="chat-conv enc-op" data-marcar="${m.user_id}"
            data-nome="${esc(m.nome)}">
            ${avatar(m.user_id, m.nome, 'chat-conv-av')}
            <span class="chat-conv-txt"><span class="chat-conv-nome">${esc(m.nome)}</span></span>
            <span class="enc-bola" aria-hidden="true"></span>
          </button>`).join('')
          : '<div class="cf-vazio">Ninguém mais por aqui ainda.</div>'}
      </div>
      <form class="enc-envio" id="enc-envio">
        <div class="enc-campo">
          ${miniaturaEncaminhada()}
          <textarea id="enc-texto" rows="1" maxlength="2000"
            placeholder="Adicione uma mensagem"></textarea>
        </div>
        <button type="submit" class="enc-mandar" id="enc-mandar" aria-label="Enviar">
          ${IC_ENVIAR}
        </button>
      </form>
    </div>`;
  pintarMarcados();
}

function pintarMarcados() {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  folha.querySelectorAll('[data-marcar]').forEach(b => {
    b.classList.toggle('marcado', encAlvos.has(b.dataset.marcar));
  });
  const mandar = folha.querySelector('#enc-mandar');
  if (mandar) mandar.disabled = encAlvos.size === 0;
  const tit = folha.querySelector('.cf-titulo');
  if (tit) tit.textContent = encAlvos.size
    ? `${encAlvos.size} selecionad${encAlvos.size > 1 ? 'os' : 'o'}`
    : 'Encaminhar para…';
}

function fecharEncaminhar() {
  const folha = document.getElementById('enc-folha');
  encaminhando = null;
  encAlvos = new Set();
  if (!folha) return;
  folha.hidden = true; folha.innerHTML = '';
}


// Folha de detalhe: quantas reações, quais emojis e QUEM reagiu. A minha vem
// com "Toque para remover" — é o caminho mais direto pra desfazer, e evita
// ter que adivinhar que tocar no emoji de novo tira.
async function abrirDetalheReacoes(msgId) {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  folha.hidden = false;
  folha.innerHTML = `<div class="enc-fundo" id="dr-fundo"></div>
    <div class="enc-caixa"><div class="cf-carregando">Carregando…</div></div>`;

  const lista = await quemReagiu(msgId);
  const meu = auth.currentUser?.uid;
  const porEmoji = new Map();
  for (const r of lista) porEmoji.set(r.emoji, (porEmoji.get(r.emoji) || 0) + 1);

  folha.innerHTML = `
    <div class="enc-fundo" id="dr-fundo"></div>
    <div class="enc-caixa">
      <div class="cf-puxador"></div>
      <div class="dr-topo">${lista.length} ${lista.length === 1 ? 'reação' : 'reações'}</div>
      <div class="dr-abas">
        ${[...porEmoji].map(([e, n]) =>
          `<span class="dr-aba">${esc(e)} <b>${n}</b></span>`).join('')}
      </div>
      <div class="enc-lista">
        ${lista.map(r => {
          const nome = perfis.get(r.user_id)?.nome || 'Falcão';
          const eu = r.user_id === meu;
          return `<button type="button" class="chat-conv dr-linha"
            ${eu ? `data-tirar-reacao="${msgId}"` : ''}>
            ${avatar(r.user_id, nome, 'chat-conv-av')}
            <span class="chat-conv-txt">
              <span class="chat-conv-nome">${eu ? 'Você' : esc(nome)}</span>
              ${eu ? '<span class="chat-conv-ult">Toque para remover</span>' : ''}
            </span>
            <span class="dr-emoji">${esc(r.emoji)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

// Emoji para a legenda da foto. Usa a mesma folha das outras listas e o
// mesmo catálogo do teclado — duas listas separadas sairiam de sincronia.
function abrirEmojisDaLegenda() {
  const folha = document.getElementById('enc-folha');
  if (!folha) return;
  folha.hidden = false;
  const todos = CATEGORIAS.filter(c => c.id !== 'recentes').flatMap(c => c.itens).slice(0, 160);
  folha.innerHTML = `
    <div class="enc-fundo" id="el-fundo"></div>
    <div class="enc-caixa">
      <div class="cf-puxador"></div>
      <div class="cf-titulo">Emoji na legenda</div>
      <div class="rc-grade">
        ${todos.map(e => `<button type="button" class="emoji-item"
          data-emoji-legenda="${e}">${e}</button>`).join('')}
      </div>
    </div>`;
}

function fecharDetalheReacoes() {
  const folha = document.getElementById('enc-folha');
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
// Ícones em SVG e não em texto: ⤓ e ↪ saem finos e minúsculos porque
// dependem da fonte do aparelho. Aqui a espessura é nossa.
const IC_COPIAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6"/></svg>';
const IC_EDITAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4.2L19.6 8.6a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z"/></svg>';
const IC_LIXO   = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5 7.6 20h8.8l1.1-13.5M10 10.5v6M14 10.5v6"/></svg>';
const IC_BAIXAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M6.5 11.5 12 17l5.5-5.5M4 20h16"/></svg>';
const IC_ENCAM  = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5.5 20.5 12 13 18.5V14C7.5 14 5 16 3.5 19c.5-6 3.5-9.5 9.5-9.5z"/></svg>';
const IC_RESP   = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 3.5 12 11 18.5V14c5.5 0 8 2 9.5 5-.5-6-3.5-9.5-9.5-9.5z"/></svg>';

// Visualizador em tela cheia. As opções ficam sob uma máscara escura que
// some ao tocar na imagem — a foto é o conteúdo, os botões são passageiros.
function verFoto(url, msgId) {
  const tela = document.getElementById('foto-ver');
  if (!tela) return;
  fotoAberta = { url, msgId };
  tela.hidden = false;
  // Entrada própria no histórico: sem ela o voltar do aparelho saía da tela
  // inteira em vez de apenas fechar a foto.
  history.pushState({ falconFoto: 1 }, '');
  fotoNoHistorico = true;
  document.body.classList.add('sem-rolagem');
  tela.className = 'foto-ver com-opcoes';
  tela.innerHTML = `
    <div class="fv-topo">
      <button type="button" class="fv-btn" id="fv-fechar" aria-label="Fechar">✕</button>
      <div class="fv-dir">
        <a class="fv-btn" href="${esc(url)}" download="falcon-foto.jpg"
          target="_blank" rel="noopener" aria-label="Baixar">${IC_BAIXAR}</a>
        <button type="button" class="fv-btn" id="fv-encaminhar" aria-label="Encaminhar">${IC_ENCAM}</button>
      </div>
    </div>
    <div class="fv-palco" id="fv-palco"><img src="${esc(url)}" alt="Foto em tela cheia" /></div>
    <form class="fv-baixo" id="fv-envio">
      <button type="button" class="fv-btn" id="fv-responder" aria-label="Responder">${IC_RESP}</button>
      <textarea id="fv-texto" rows="1" maxlength="2000"
        placeholder="Responder mensagem"></textarea>
      <button type="submit" class="fv-btn fv-mandar" aria-label="Enviar">➤</button>
    </form>`;
}

function alternarOpcoesFoto() {
  const tela = document.getElementById('foto-ver');
  if (tela) tela.classList.toggle('com-opcoes');
}

function fecharVisualizador({ voltando = false } = {}) {
  const tela = document.getElementById('foto-ver');
  if (!tela) return;
  // Fechar pelo ✕ consome a entrada do histórico; vindo do popstate ela já
  // foi consumida e chamar back() de novo sairia da conversa.
  if (fotoNoHistorico && !voltando) { fotoNoHistorico = false; history.back(); return; }
  fotoNoHistorico = false;
  fotoAberta = null;
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
// CÂMERA DENTRO DO APP
// ═══════════════════════════════════════════════════════════════
// O <input capture> entrega a câmera do sistema, que exige confirmar a foto
// (✓) antes de devolvê-la — e o botão de voltar ali DESCARTA a imagem. Com a
// câmera aqui dentro não existe esse passo: apertou, virou anexo.
//
// Se o aparelho negar a câmera, cai de volta no input do sistema em vez de
// deixar a pessoa sem saída.
let camStream = null;
let camLado = 'environment';

async function abrirCamera() {
  const tela = document.getElementById('cam-tela');
  const video = document.getElementById('cam-video');
  if (!tela || !video || !navigator.mediaDevices?.getUserMedia) {
    document.getElementById('chat-foto-camera')?.click();
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: camLado, width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = camStream;
    tela.hidden = false;
    document.body.classList.add('sem-rolagem');
  } catch {
    // permissão negada ou câmera ocupada: o caminho do sistema ainda funciona
    document.getElementById('chat-foto-camera')?.click();
  }
}

function fecharCamera() {
  const tela = document.getElementById('cam-tela');
  const video = document.getElementById('cam-video');
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  if (video) video.srcObject = null;
  if (tela) tela.hidden = true;
  document.body.classList.remove('sem-rolagem');
}

async function virarCamera() {
  camLado = camLado === 'environment' ? 'user' : 'environment';
  fecharCamera();
  await abrirCamera();
}

// Desenha o QUADRO ATUAL do vídeo num canvas. É o mesmo caminho de redução
// que a galeria usa, então a foto sai do mesmo tamanho pelos dois lados.
async function dispararFoto() {
  const video = document.getElementById('cam-video');
  if (!video?.videoWidth) return;
  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(video.videoWidth, video.videoHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(video.videoWidth * escala);
  cv.height = Math.round(video.videoHeight * escala);
  const ctx = cv.getContext('2d');
  // A frontal mostra espelhado; sem desespelhar, a foto sai invertida do que
  // a pessoa viu na tela.
  if (camLado === 'user') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
  fecharCamera();
  if (!blob) { showToast('Não deu pra capturar a foto.', 'error'); return; }
  limparAnexo();
  anexo = { blob, previa: URL.createObjectURL(blob) };
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
  // O chip abre o DETALHE (quem reagiu), não reage de novo: tocar por engano
  // num emoji alheio trocaria a minha reação sem eu perceber.
  return `<div class="reac-fita ${m.imagem_path ? 'sobre-foto' : ''}">${lista.map(r => `
    <button type="button" class="reac-chip ${r.eu ? 'minha' : ''}"
      data-ver-reacoes="${m.id}">
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
        <span class="wa-hora ${m.imagem_path && !m.texto ? 'hora-na-foto' : ''}">${hora(m.created_at)}${m.editada_em ? ' · editada' : ''} · ${tempoRestante(m.created_at)}</span>
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
const selecionados = new Map();   // id -> { id, editavel, apagavel, texto }
let engolirClique = false;   // ver o handler de clique: o clique do próprio gesto

// Alterna: tocar numa já selecionada tira, em outra soma. Encaminhar várias
// de uma vez é o caso que justifica isso — separar um trecho de conversa uma
// mensagem por vez seria trabalho de formiga.
function selecionarMensagem(el) {
  const id = el.dataset.id;
  if (!id) return;
  if (selecionados.has(id)) {
    selecionados.delete(id);
    el.classList.remove('msg-sel');
  } else {
    selecionados.set(id, {
      id,
      editavel: el.dataset.editavel === '1',
      apagavel: el.dataset.apagavel === '1',
      texto: el.querySelector('.dc-txt, .wa-txt')?.textContent || '',
    });
    el.classList.add('msg-sel');
  }
  pintarBarraSelecao();
  engolirClique = true;
  try { navigator.vibrate?.(12); } catch {}
}

function limparSelecao() {
  selecionados.clear();
  document.querySelectorAll('.msg-sel').forEach(e => e.classList.remove('msg-sel'));
  pintarBarraSelecao();
}

// Atalho: a maioria das ações só faz sentido com UMA selecionada.
function umaSo() {
  return selecionados.size === 1 ? [...selecionados.values()][0] : null;
}


// Sete atalhos + "…" pro catálogo completo, como no WhatsApp. Os sete são os
// que cobrem quase todo uso real; obrigar a abrir o catálogo pra dar um 👍
// transformaria um gesto em três toques.
const REAC_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '💪'];

function pintarBarraSelecao() {
  const barra = document.getElementById('chat-selbar');
  const fita = document.getElementById('reac-barra');
  const n = selecionados.size;
  const uma = umaSo();
  if (barra) {
    barra.hidden = !n;
    if (n) {
      barra.querySelector('.selbar-tit').textContent = n === 1 ? '1 mensagem' : n + ' mensagens';
      // Responder, editar e copiar são de UMA mensagem. Encaminhar e apagar
      // valem para o conjunto — apagar só se eu puder apagar todas.
      barra.querySelector('[data-sel-responder]').hidden = !uma;
      barra.querySelector('[data-sel-editar]').hidden = !(uma && uma.editavel);
      barra.querySelector('[data-sel-copiar]').hidden = !uma;
      barra.querySelector('[data-sel-apagar]').hidden =
        [...selecionados.values()].some(m => !m.apagavel);
    }
  }
  // Reagir é sobre UMA mensagem: com várias, não há em qual colar o emoji.
  if (fita) {
    fita.hidden = !uma;
    if (uma) {
      const minha = (reacoes.get(uma.id) || []).find(r => r.eu)?.emoji || null;
      fita.innerHTML = REAC_RAPIDAS.map(e =>
        '<button type="button" class="rb-item ' + (e === minha ? 'ativa' : '') + '"' +
        ' data-reagir="' + uma.id + '" data-emoji="' + e + '">' + e + '</button>').join('')
        + '<button type="button" class="rb-item rb-mais" id="rb-mais" aria-label="Mais emojis">＋</button>';
      posicionarFitaReacao(uma.id);
    } else { fita.innerHTML = ''; }
  }
}

// A fita nasce colada na mensagem: acima dela quando há espaço, abaixo quando
// a mensagem está no topo da tela. Fixa no topo ela parecia de outra coisa.
function posicionarFitaReacao(id) {
  const fita = document.getElementById('reac-barra');
  const msg = document.querySelector('[data-id="' + id + '"]');
  if (!fita || !msg) return;
  const r = msg.getBoundingClientRect();
  const alt = 54;
  const acima = r.top - alt - 8;
  fita.style.top = (acima > 70 ? acima : Math.min(r.bottom + 8, window.innerHeight - alt - 90)) + 'px';
  fita.style.left = '50%';
  fita.style.transform = 'translateX(-50%)';
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

    if (selecionados.size && !t.closest('.chat-selbar') && !t.closest('.reac-barra')
        && !t.closest('.enc-folha')) {
      // ESTA CHECAGEM VEM PRIMEIRO. Soltar o dedo depois de segurar dispara
      // um clique logo atrás da seleção, em cima da MESMA mensagem. Com a
      // alternância antes daqui, esse clique desmarcava o que o toque longo
      // acabara de marcar — a seleção piscava e sumia.
      if (engolirClique) { engolirClique = false; return; }

      // Em modo de seleção, tocar numa mensagem ALTERNA: soma se for nova,
      // tira se já estava. É o que permite juntar várias pra encaminhar.
      const outra = t.closest('.dc-msg, .wa-msg');
      if (outra?.dataset.id) { selecionarMensagem(outra); return; }
      limparSelecao();
      return;
    }

    // ── reagir (fita da seleção OU chip embaixo da mensagem) ──
    const chipReac = t.closest('[data-ver-reacoes]');
    if (chipReac) { await abrirDetalheReacoes(chipReac.dataset.verReacoes); return; }
    if (t.closest('#dr-fundo')) { fecharDetalheReacoes(); return; }
    const tirarMinha = t.closest('[data-tirar-reacao]');
    if (tirarMinha) {
      const id = tirarMinha.dataset.tirarReacao;
      const atual = (reacoes.get(id) || []).find(r => r.eu)?.emoji || null;
      fecharDetalheReacoes();
      try { await reagir(id, atual, atual); await recarregar(); }
      catch (e) { showToast(e.message, 'error'); }
      return;
    }

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
      const alvo = umaSo()?.id;
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
    if (t.closest('[data-sel-responder]') && umaSo()) {
      const m = porId.get(umaSo().id);
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
    if (t.closest('[data-sel-encaminhar]') && selecionados.size) {
      const msgs = [...selecionados.keys()].map(id => porId.get(id)).filter(Boolean);
      limparSelecao();
      if (msgs.length) await abrirEncaminhar(msgs);
      return;
    }
    if (t.closest('#enc-fundo')) { fecharEncaminhar(); return; }
    const marcar = t.closest('[data-marcar]');
    if (marcar) {
      const id = marcar.dataset.marcar;
      if (encAlvos.has(id)) encAlvos.delete(id); else encAlvos.add(id);
      encAlvos._nomes = encAlvos._nomes || {};
      encAlvos._nomes[id] = marcar.dataset.nome;
      pintarMarcados();
      return;
    }

    const abrirFoto = t.closest('[data-abrir-foto]');
    if (abrirFoto) {
      verFoto(abrirFoto.dataset.abrirFoto, abrirFoto.closest('[data-id]')?.dataset.id);
      return;
    }
    if (t.closest('#fv-palco')) { alternarOpcoesFoto(); return; }
    if (t.closest('#fv-encaminhar') && fotoAberta?.msgId) {
      const m = porId.get(fotoAberta.msgId);
      fecharVisualizador();
      if (m) await abrirEncaminhar([m]);
      return;
    }
    if (t.closest('#fv-responder') && fotoAberta?.msgId) {
      const m = porId.get(fotoAberta.msgId);
      fecharVisualizador();
      if (m) {
        respondendoA = { id: m.id, nome: m.autor_nome || 'Falcão',
                         texto: m.texto || '', temFoto: !!m.imagem_path };
        pintarRespondendo();
        app.querySelector('#chat-texto')?.focus();
      }
      return;
    }
    if (t.closest('#fv-fechar')) { fecharVisualizador(); return; }
    if (t.closest('#fe-cancelar')) { limparAnexo(); return; }
    if (t.closest('#fe-emoji')) { abrirEmojisDaLegenda(); return; }
    const emjLeg = t.closest('[data-emoji-legenda]');
    if (emjLeg) {
      const campo = app.querySelector('#fe-legenda');
      if (campo) { campo.value += emjLeg.dataset.emojiLegenda; registrarUso(emjLeg.dataset.emojiLegenda); }
      return;
    }
    if (t.closest('#el-fundo')) { document.getElementById('enc-folha').hidden = true; return; }
    if (t.closest('#fe-enviar')) { app.querySelector('#chat-envio')?.requestSubmit(); return; }

    if (t.closest('#chat-foto-btn')) {
      const folha = app.querySelector('#chat-midia');
      if (folha) folha.hidden = !folha.hidden;
      return;
    }
    const opMidia = t.closest('[data-midia]');
    if (opMidia) {
      app.querySelector('#chat-midia').hidden = true;
      if (opMidia.dataset.midia === 'camera') await abrirCamera();
      else app.querySelector('#chat-foto-galeria')?.click();
      return;
    }
    if (t.closest('#cam-fechar')) { fecharCamera(); return; }
    if (t.closest('#cam-virar')) { await virarCamera(); return; }
    if (t.closest('#cam-disparo')) { await dispararFoto(); return; }
    if (t.closest('#cam-galeria')) {
      fecharCamera();
      app.querySelector('#chat-foto-galeria')?.click();
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

    if (t.closest('[data-sel-copiar]') && umaSo()) {
      const texto = umaSo().texto;
      limparSelecao();
      try { await navigator.clipboard.writeText(texto); showToast('Copiado.', 'info'); }
      catch { showToast('Seu navegador não deixou copiar.', 'error'); }
      return;
    }

    if (t.closest('[data-sel-editar]') && umaSo()?.editavel) {
      const campo = app.querySelector('#chat-texto');
      if (campo) {
        const alvoEd = umaSo();
        editando = alvoEd.id;
        campo.value = alvoEd.texto;
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

    if (t.closest('[data-sel-apagar]') && selecionados.size) {
      // Alheia = posso apagar mas não editar, o que só acontece por
      // privilégio de administrador.
      const alvos = [...selecionados.values()];
      const alheia = alvos.some(m => !m.editavel);
      const n = alvos.length;
      limparSelecao();
      const ok = await confirmModal({
        title: n > 1 ? `Apagar ${n} mensagens?`
             : alheia ? 'Apagar mensagem de outra pessoa?' : 'Apagar mensagem?',
        message: alheia
          ? 'Você está apagando como administrador. Some para todo mundo.'
          : 'Some para todo mundo.',
        confirmText: 'Apagar', cancelText: 'Manter', danger: true,
      });
      if (!ok) return;
      try {
        for (const m of alvos) await apagarMensagem(m.id);
        await recarregar();
      } catch (e) { showToast(e.message, 'error'); }
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
  // No Android, segurar o dedo dispara DOIS caminhos: o temporizador acima e
  // o contextmenu nativo. Quando selecionar apenas marcava, chamar duas vezes
  // era inofensivo — agora que ALTERNA, a segunda chamada desmarcava o que a
  // primeira tinha acabado de marcar, e a seleção nunca ficava de pé.
  // Aqui o contextmenu só age se o toque longo ainda não tiver resolvido.
  app.addEventListener('contextmenu', (ev) => {
    const msg = ev.target.closest('.dc-msg, .wa-msg');
    if (!msg || !msg.dataset.id) return;
    ev.preventDefault();   // sempre: o menu nativo de seleção de texto atrapalha
    if (selecionados.has(msg.dataset.id)) return;   // o toque longo já marcou
    clearTimeout(pressTimer); pressTimer = null;    // evita marcar de novo em seguida
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
    if (ev.target.id === 'enc-filtro') {
      const termo = ev.target.value.trim().toLowerCase();
      app.querySelectorAll('#enc-lista [data-marcar]').forEach(b => {
        b.hidden = !!termo && !b.dataset.nome.toLowerCase().includes(termo);
      });
      return;
    }
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
    if (ev.target.closest('#enc-envio')) {
      ev.preventDefault();
      if (!encAlvos.size) return;
      const extra = (app.querySelector('#enc-texto')?.value || '').trim();
      const msgs = encaminhando || [];
      const alvos = [...encAlvos];
      const nomes = encAlvos._nomes || {};
      fecharEncaminhar();
      try {
        for (const alvo of alvos) {
          for (const m of msgs) await encaminhar(m, alvo, meuNome);
          if (extra) await enviarPrivado(alvo, extra, meuNome);
        }
        if (alvos.length === 1) {
          // Uma pessoa só: abre a conversa dela, com a mensagem já lá. Assim
          // a pessoa vê que chegou em vez de ter que confiar num aviso.
          aba = 'privado';
          conversaCom = { id: alvos[0], nome: nomes[alvos[0]] || 'Falcão' };
          history.pushState({ falconConversa: 1 }, '');
          entradaNoHistorico = true;
          app.querySelectorAll('[data-aba]').forEach(b =>
            b.classList.toggle('active', b.dataset.aba === 'privado'));
          await recarregar();
        } else {
          // Várias: não faz sentido abrir uma delas, então fica onde estava
          // e o aviso é o que confirma o envio.
          showToast(`Enviado para ${alvos.length} pessoas.`, 'success');
        }
      } catch (e) { showToast(e.message, 'error'); }
      return;
    }

    // Responder de dentro da foto aberta, sem precisar fechá-la primeiro.
    if (ev.target.closest('#fv-envio')) {
      ev.preventDefault();
      const campo = app.querySelector('#fv-texto');
      const texto = campo.value.trim();
      if (!texto || !fotoAberta?.msgId) return;
      campo.value = '';
      const alvo = fotoAberta.msgId;
      try {
        if (aba === 'mural') await enviarNoMural(texto, meuNome, null, alvo);
        else if (conversaCom) await enviarPrivado(conversaCom.id, texto, meuNome, null, alvo);
        fecharVisualizador();
        await recarregar();
      } catch (e) { campo.value = texto; showToast(e.message, 'error'); }
      return;
    }
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
