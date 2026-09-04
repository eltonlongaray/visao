// ─── ÍNDICE ──────────────────────────────────────────────────
// Camada de dados das RIFAS (lado do DONO — logado). Cada usuário cria e
// gere as PRÓPRIAS rifas (RLS: owner_id = auth.uid()). O link público lê por
// RPC (rifa-publica-dados.js). Pagamento = chave Pix do próprio criador.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

function _uid() { return auth.currentUser?.uid || null; }

// ── slug bonito a partir do título (sem acento, só a-z0-9 e hífen) ──
function _slugify(txt) {
  const base = String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'rifa';
}
const _code = (n = 3) => Math.random().toString(36).slice(2, 2 + n);

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: MINHAS RIFAS (dono)
// ═══════════════════════════════════════════════════════════════
export async function getMinhasRifas() {
  const uid = _uid(); if (!uid) return [];
  const { data, error } = await supabase.from('rifas').select('*')
    .eq('owner_id', uid).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRifaById(id) {
  const { data, error } = await supabase.from('rifas').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Cria a rifa do usuário. Gera um slug livre a partir do título (retry em colisão).
export async function criarRifa(dados) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const base = _slugify(dados.titulo);
  const linha = { ..._normalizar(dados), owner_id: uid, pix_modo: 'estatico', ativo: dados.ativo !== false };
  for (let i = 0; i < 30; i++) {
    linha.slug = i === 0 ? base : `${base}-${_code(2 + Math.floor(i / 8))}`;
    const { data, error } = await supabase.from('rifas').insert(linha).select('*').single();
    if (!error) return data;
    if (!/duplicate|unique|23505/i.test(error.message || '')) throw new Error(error.message);
  }
  throw new Error('Não achei um endereço livre pro link. Mude um pouco o título.');
}

export async function atualizarRifa(id, patch) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const { error } = await supabase.from('rifas').update(_normalizar(patch)).eq('id', id).eq('owner_id', uid);
  if (error) throw new Error(error.message);
}

export async function excluirRifa(id) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const { error } = await supabase.from('rifas').delete().eq('id', id).eq('owner_id', uid);
  if (error) throw new Error(error.message);
}

// Só os campos editáveis (evita mandar lixo pro banco).
function _normalizar(d) {
  const out = {};
  const put = (k, v) => { if (v !== undefined) out[k] = v; };
  put('titulo', d.titulo != null ? String(d.titulo).trim() : undefined);
  put('subtitulo', d.subtitulo != null ? (String(d.subtitulo).trim() || null) : undefined);
  put('descricao', d.descricao != null ? (String(d.descricao).trim() || null) : undefined);
  put('total_numeros', d.total_numeros != null ? Math.max(1, parseInt(d.total_numeros, 10) || 1) : undefined);
  put('valor_numero', d.valor_numero != null ? (d.valor_numero === '' ? null : Number(d.valor_numero)) : undefined);
  put('valor_meta', d.valor_meta != null ? (d.valor_meta === '' ? null : Number(d.valor_meta)) : undefined);
  put('sorteio_em', d.sorteio_em !== undefined ? (d.sorteio_em || null) : undefined);
  put('whatsapp', d.whatsapp != null ? (String(d.whatsapp).trim() || null) : undefined);
  put('premios', Array.isArray(d.premios) ? d.premios.map(p => String(p).trim()).filter(Boolean) : undefined);
  put('pix_chave', d.pix_chave != null ? (String(d.pix_chave).trim() || null) : undefined);
  put('pix_nome', d.pix_nome != null ? (String(d.pix_nome).trim() || null) : undefined);
  put('pix_cidade', d.pix_cidade != null ? (String(d.pix_cidade).trim() || null) : undefined);
  if (d.ativo !== undefined) out.ativo = !!d.ativo;
  return out;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PARTICIPANTES (quem pegou cada número)
// ═══════════════════════════════════════════════════════════════
export async function getParticipantes(rifaId) {
  const { data, error } = await supabase.from('rifa_numeros')
    .select('id, numero, nome, contato, pago, created_at')
    .eq('rifa_id', rifaId).order('numero', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Marca/desmarca um número como PAGO (o criador confirma quem pagou).
export async function marcarPago(id, pago) {
  const { error } = await supabase.from('rifa_numeros').update({ pago: !!pago }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Remove um número (ex.: pessoa desistiu / número liberado de novo).
export async function removerParticipante(id) {
  const { error } = await supabase.from('rifa_numeros').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: SORTEIO AO VIVO
// ═══════════════════════════════════════════════════════════════
// Sorteia UM prêmio (ordem 1..N). numero = null → aleatório entre os vendidos que
// ainda não ganharam; numero informado → revela aquele (ex.: Loteria Federal).
export async function sortearPremio(slug, ordem, numero = null) {
  const { data, error } = await supabase.rpc('sortear_premio', { p_slug: slug, p_ordem: ordem, p_numero: numero });
  if (error) throw new Error(error.message);
  return data;
}
// status: 'agendado' (refaz/zera) | 'ao_vivo' | 'encerrado'
export async function definirStatusSorteio(slug, status) {
  const { data, error } = await supabase.rpc('definir_status_sorteio', { p_slug: slug, p_status: status });
  if (error) throw new Error(error.message);
  return data;
}
