// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — MURAL DA COMUNIDADE
// BLOCO 3 — CONVERSAS PRIVADAS
// BLOCO 4 — MEMBROS + FAXINA
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
import { getProfile } from './banco-dados.js';

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
    .select('id, autor_id, autor_nome, texto, created_at, expira_em')
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
    .select('id, autor_id, para_id, autor_nome, texto, created_at')
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
  // Lista vazia por falha e lista vazia por não ter ninguém são coisas
  // diferentes. Sem este aviso, um erro de RPC vira "a comunidade está vazia".
  if (error) { console.warn('[Falcon] membros_comunidade:', error.message); return []; }
  return data || [];
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
