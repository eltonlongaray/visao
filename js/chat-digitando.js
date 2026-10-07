// ─── ÍNDICE ──────────────────────────────────────────────────
// "Fulano está digitando…" no chat (Comunidade e Privado).
// Usa o Broadcast do Supabase Realtime: só avisos passageiros entre quem
// está com a sala aberta, nada vai pro banco (sem tabela, sem SQL).
// O aviso carrega só id e nome de quem digita — nunca o texto.
// BLOCO 1 — SALA (entrar, sair, receber)
// BLOCO 2 — AVISAR QUE ESTOU DIGITANDO
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

const EXPIRA_MS = 4000;     // sem novo aviso nesse tempo, os pontinhos somem
const REAVISO_MS = 2500;    // enquanto digita, reavisa nesse intervalo

let canal = null;           // canal da sala aberta
let salaAtual = null;
let eu = null;              // { id, nome }
let digitando = new Map();  // id -> { nome, ate }
let aoMudar = () => {};
let aoChegarMensagem = () => {};
let relogio = null;
let ultimoAviso = 0;
let avisando = false;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SALA
// ═══════════════════════════════════════════════════════════════
// sala: 'mural' ou 'priv:<idA>:<idB>' (ids em ordem, os dois caem na mesma)
export function salaPrivada(a, b) { return `priv:${[a, b].sort().join(':')}`; }

export function entrarNaSala(sala, quem, { mudou, chegou } = {}) {
  aoMudar = mudou || (() => {});
  aoChegarMensagem = chegou || (() => {});
  if (sala === salaAtual) return;
  sairDaSala();
  if (!sala || !quem?.id || typeof supabase?.channel !== 'function') return;
  salaAtual = sala;
  eu = quem;
  try {
    canal = supabase.channel(`digitando:${sala}`, { config: { broadcast: { self: false } } });
    canal.on('broadcast', { event: 'digitando' }, ({ payload } = {}) => receber(payload));
    canal.subscribe();
  } catch (e) { console.warn('[digitando]', e); canal = null; }
  relogio = setInterval(limparVencidos, 1000);
}

export function sairDaSala() {
  if (canal) {
    pararDeDigitar();
    try { supabase.removeChannel(canal); } catch {}
  }
  canal = null; salaAtual = null;
  clearInterval(relogio); relogio = null;
  if (digitando.size) { digitando.clear(); aoMudar([]); }
}

function receber(p) {
  if (!p?.id || p.id === eu?.id) return;
  if (p.digitando) digitando.set(p.id, { nome: p.nome || 'Falcão', ate: Date.now() + EXPIRA_MS });
  else digitando.delete(p.id);
  aoMudar(lista());
  // Quem parou porque ENVIOU: busca já, sem esperar a atualização de 12s
  if (p.enviou) aoChegarMensagem();
}

function limparVencidos() {
  const agora = Date.now();
  let mudou = false;
  for (const [id, d] of digitando) if (d.ate < agora) { digitando.delete(id); mudou = true; }
  if (mudou) aoMudar(lista());
}

const lista = () => [...digitando.values()].map(d => d.nome);

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: AVISAR
// ═══════════════════════════════════════════════════════════════
function mandar(payload) {
  if (!canal) return;
  try { canal.send({ type: 'broadcast', event: 'digitando', payload: { id: eu.id, nome: eu.nome, ...payload } }); }
  catch {}
}

// Chamado a cada tecla: avisa na primeira e depois só de tempos em tempos
export function estouDigitando() {
  const agora = Date.now();
  if (avisando && agora - ultimoAviso < REAVISO_MS) return;
  avisando = true; ultimoAviso = agora;
  mandar({ digitando: true });
}

export function pararDeDigitar({ enviou = false } = {}) {
  if (!avisando && !enviou) return;
  avisando = false; ultimoAviso = 0;
  mandar({ digitando: false, enviou });
}

// "Ana está digitando", "Ana e Beto estão digitando", "3 pessoas estão digitando"
export function textoDeQuem(nomes) {
  if (!nomes.length) return '';
  if (nomes.length === 1) return `${nomes[0]} está digitando`;
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]} estão digitando`;
  return `${nomes.length} pessoas estão digitando`;
}
