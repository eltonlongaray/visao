// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — MURAL DA COMUNIDADE
// BLOCO 3 — CONVERSAS PRIVADAS
// BLOCO 4 — MEMBROS + FOTOS + FAXINA
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Camada de dados do chat. Duas modalidades na mesma tabela:
// 'comunidade' (mural, um fala para todos) e 'privado' (dois a dois).
//
// Quem garante a privacidade é o RLS no banco, não este arquivo — mesmo que
// alguém chame estas funções na mão pelo console, o Postgres só devolve o
// que a política permite. Ver migration/chat.sql.
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { getProfile, setProfile } from './banco-dados.js';

const LIMITE = 200;

function _falha(error) {
  if (error) throw new Error(error.message || 'Erro no chat');
}

// Nome que assina a mensagem. Guardado junto na linha porque o autor pode
// mudar o perfil depois — a mensagem antiga mantém como ele assinava na hora.
export async function meuNomeDeChat() {
  try {
    const p = await getProfile();
    return (p?.preferredName || p?.fullName || '').trim() || 'Falcão';
  } catch { return 'Falcão'; }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: MURAL DA COMUNIDADE
// ═══════════════════════════════════════════════════════════════
export async function fetchMural() {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('id, autor_id, autor_nome, texto, created_at, expira_em, editada_em')
    .eq('escopo', 'comunidade')
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  _falha(error);
  return (data || []).reverse();   // mais antigas em cima, como conversa
}

export async function enviarNoMural(texto, nome) {
  const t = (texto || '').trim();
  if (!t) return;
  const { error } = await supabase.from('chat_mensagens').insert({
    escopo: 'comunidade',
    autor_id: auth.currentUser?.uid,
    autor_nome: nome,
    texto: t.slice(0, 2000),
  });
  _falha(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CONVERSAS PRIVADAS
// ═══════════════════════════════════════════════════════════════
export async function fetchConversa(outroId) {
  const meu = auth.currentUser?.uid;
  if (!meu || !outroId) return [];
  // Os dois sentidos da conversa. O RLS já barra o que não é meu, mas o
  // filtro explícito evita puxar o mural junto.
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('id, autor_id, para_id, autor_nome, texto, created_at, editada_em')
    .eq('escopo', 'privado')
    .or(`and(autor_id.eq.${meu},para_id.eq.${outroId}),and(autor_id.eq.${outroId},para_id.eq.${meu})`)
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  _falha(error);
  return (data || []).reverse();
}

export async function enviarPrivado(outroId, texto, nome) {
  const t = (texto || '').trim();
  if (!t || !outroId) return;
  const { error } = await supabase.from('chat_mensagens').insert({
    escopo: 'privado',
    autor_id: auth.currentUser?.uid,
    para_id: outroId,
    autor_nome: nome,
    texto: t.slice(0, 2000),
  });
  _falha(error);
}

// Lista de quem já trocou mensagem comigo, com a última de cada conversa.
export async function fetchConversas() {
  const { data, error } = await supabase.rpc('minhas_conversas');
  if (error) { console.warn('[Falcon] minhas_conversas:', error.message); return []; }
  return data || [];
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: MEMBROS + FAXINA
// ═══════════════════════════════════════════════════════════════
// Só id e nome de exibição — a função no banco não devolve e-mail nem telefone.
export async function fetchMembros() {
  const { data, error } = await supabase.rpc('membros_comunidade');
  // Propaga em vez de devolver lista vazia: "a chamada falhou" e "não há mais
  // ninguém" apareciam iguais na tela, e isso escondia o motivo real.
  if (error) throw new Error(error.message || 'Erro ao listar membros');
  return data || [];
}

// ─── FOTOS ─────────────────────────────────────────────────────
// Mapa id -> { nome, foto } de todo mundo, inclusive de quem está chamando:
// o mural mostra as minhas mensagens junto das outras e elas também precisam
// de rosto. A mensagem guarda o NOME de quando foi escrita, mas a foto é
// sempre a atual — trocou nos Ajustes, muda no histórico inteiro.
let _perfis = null;
let _perfisEm = 0;
const PERFIS_TTL = 5 * 60 * 1000;

export async function fetchPerfis({ forcar = false } = {}) {
  if (!forcar && _perfis && Date.now() - _perfisEm < PERFIS_TTL) return _perfis;
  const { data, error } = await supabase.rpc('perfis_do_chat');
  if (error) {
    // Sem foto o chat continua funcionando com as iniciais coloridas.
    console.warn('[Falcon] perfis_do_chat:', error.message);
    return _perfis || new Map();
  }
  _perfis = new Map((data || []).map(p => [p.user_id, { nome: p.nome, foto: p.foto || null }]));
  _perfisEm = Date.now();
  return _perfis;
}

export function limparCachePerfis() { _perfis = null; _perfisEm = 0; }

// Sobe a foto escolhida e aponta o perfil pra ela. O caminho é sempre
// '{uid}/foto.jpg' — a política do bucket exige que a primeira pasta seja o
// próprio id, então ninguém sobrescreve a foto de outro.
export async function trocarMinhaFoto(blob) {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Sessão expirada');
  const caminho = `${id}/foto.jpg`;
  const { error } = await supabase.storage
    .from('avatares')
    .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(error.message || 'Não deu pra enviar a foto');

  const { data } = supabase.storage.from('avatares').getPublicUrl(caminho);
  // ?t= derruba o cache do CDN: o caminho é o mesmo a cada troca e sem isso
  // a foto antiga continuaria aparecendo.
  const url = `${data.publicUrl}?t=${Date.now()}`;
  await setProfile({ fotoUrl: url });
  limparCachePerfis();
  return url;
}

// Volta pra foto do Google (ou pras iniciais, se a pessoa não entrou por lá).
export async function removerMinhaFoto() {
  const id = auth.currentUser?.uid;
  if (id) await supabase.storage.from('avatares').remove([`${id}/foto.jpg`]);
  await setProfile({ fotoUrl: null });
  limparCachePerfis();
}

// Só o texto muda. Um gatilho no banco rejeita qualquer outra alteração —
// sem ele, editar seria uma porta pra esticar a validade da mensagem ou
// mover uma conversa privada pro mural.
export async function editarMensagem(id, texto) {
  const t = (texto || '').trim();
  if (!t) return;
  const { error } = await supabase.from('chat_mensagens')
    .update({ texto: t.slice(0, 2000) }).eq('id', id);
  _falha(error);
}

export async function apagarMensagem(id) {
  const { error } = await supabase.from('chat_mensagens').delete().eq('id', id);
  _falha(error);
}

// Chamada de vez em quando ao abrir o chat. A expiração já é garantida na
// leitura pelo RLS; isto só evita a tabela crescer para sempre.
export async function faxinaChat() {
  try { await supabase.rpc('limpar_chat_expirado'); } catch { /* silencioso */ }
}

// Quanto falta para a mensagem sumir — o chat é temporário e isso precisa
// ficar visível, senão as pessoas contam com um histórico que não existe.
export function tempoRestante(criadaEm) {
  const fim = new Date(criadaEm).getTime() + 7 * 24 * 60 * 60 * 1000;
  const falta = fim - Date.now();
  if (falta <= 0) return 'expirando';
  const dias = Math.floor(falta / 86400000);
  if (dias >= 1) return `${dias}d`;
  const horas = Math.floor(falta / 3600000);
  return horas >= 1 ? `${horas}h` : 'menos de 1h';
}
