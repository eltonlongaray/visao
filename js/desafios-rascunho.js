// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Rascunho da prova do desafio
// Gravou e não quer mandar agora: o vídeo fica guardado SÓ no aparelho
// (IndexedDB), aparece apagadinho na conversa do grupo com a hora em que foi
// gravado e um botão Enviar. Só vale no dia em que foi gravado.
// BLOCO 1 — GUARDAR NO APARELHO
// BLOCO 2 — ENVIAR / APAGAR
// ─────────────────────────────────────────────────────────────
import { addCheckin, subirProva } from './desafios.js';
import { gerarConteudo } from './prova-conteudo.js';
import { auth } from './autenticacao.js';
import { showToast } from './aviso-tela.js';
import { passouDoLimite, horaLimite } from './desafios-moldes.js';

const _hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: GUARDAR NO APARELHO
// ═══════════════════════════════════════════════════════════════
const DB = 'falcon-rascunhos', ST = 'provas';
function _abrir() {
  return new Promise((ok, erro) => {
    if (typeof indexedDB === 'undefined') return erro(new Error('Esse aparelho não guarda rascunho.'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error || new Error('Não deu pra abrir os rascunhos'));
  });
}
async function _tx(modo, fn) {
  const db = await _abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction(ST, modo);
    const res = fn(t.objectStore(ST));
    t.oncomplete = () => { db.close(); ok(res?.result ?? res); };
    t.onerror = () => { db.close(); erro(t.error); };
  });
}

// { desafioId, blob, quantidade, exercicio, falhou, tipo: 'video' | 'depoimento' }
export async function salvarRascunho(r) {
  const uid = auth.currentUser?.uid;
  const agora = new Date();
  const item = { ...r, id: `${agora.getTime()}-${Math.random().toString(36).slice(2, 7)}`, uid, dia: _hoje(), gravadoEm: agora.toISOString() };
  await _tx('readwrite', s => s.put(item));
  window.dispatchEvent(new CustomEvent('falcon:rascunho', { detail: { desafioId: r.desafioId } }));
  return item;
}

// Rascunhos desta pessoa neste desafio, do mais antigo pro mais novo
export async function listarRascunhos(desafioId) {
  const uid = auth.currentUser?.uid;
  try {
    const todos = await _tx('readonly', s => s.getAll());
    return (todos || []).filter(r => r.desafioId === desafioId && r.uid === uid)
      .sort((a, b) => a.gravadoEm.localeCompare(b.gravadoEm));
  } catch { return []; }
}

export async function apagarRascunho(id) {
  await _tx('readwrite', s => s.delete(id));
}

// Ainda dá pra mandar? '' = sim; senão o motivo
export function motivoRascunhoVencido(r, d) {
  if (r.dia !== _hoje()) return 'Era de outro dia: não vale mais';
  if (!r.doente && passouDoLimite(d)) return `Passou das ${horaLimite(d)}: não vale mais`;
  return '';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ENVIAR / APAGAR
// ═══════════════════════════════════════════════════════════════
// Sobe o vídeo e registra a prova como se tivesse mandado na hora. O banco
// confere as regras de novo. true = enviou (e o rascunho some).
export async function enviarRascunho(r, d) {
  const motivo = motivoRascunhoVencido(r, d);
  if (motivo) { showToast(motivo, 'info'); return false; }
  try {
    showToast('Enviando a prova…', 'info');
    const videoPath = await subirProva(r.blob, 'video');
    const id = await addCheckin(d.id, r.falhou ? 0 : (r.quantidade || 1), { exercicio: r.exercicio || null, videoPath, doente: !!r.doente });
    if (r.tipo === 'depoimento' && id) gerarConteudo(id, r.blob);
    await apagarRascunho(r.id);
    showToast(r.doente ? '🤒 Dia justificado. Melhoras! 🦅' : r.tipo === 'depoimento' ? '🎙️ Depoimento enviado! 🦅' : '🎥 Prova enviada! 🦅', 'success');
    return true;
  } catch (e) {
    showToast(e.message || 'Não deu pra enviar', 'error');
    return false;
  }
}
