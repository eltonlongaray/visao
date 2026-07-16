// ═══════════════════════════════════════════════════════════════
// FALCON · Desafios — camada de dados (Supabase) + bolinha da Home
// A UI vive em screens/tela-desafios.js. Moldes em desafios-moldes.js.
// Sem dinheiro. RLS admin via profiles.is_admin.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

const SEEN_KEY = 'visao_desafios_vistos';   // ids já vistos neste dispositivo

// ── Estado de "visto" (bolinha) ──────────────────────────────
function _seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
export function markDesafiosSeen(ids) {
  const cur = _seen();
  ids.forEach(id => cur.add(id));
  localStorage.setItem(SEEN_KEY, JSON.stringify([...cur]));
}
// Zera o "visto" — usado no preview "ver como usuário" pra reviver a bolinha.
export function resetDesafiosSeen() { localStorage.removeItem(SEEN_KEY); }

// "250, 500" → [250,500] ; vazio → []
export function parseOpcoes(str) {
  return String(str || '').split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
}

// ── Desafios ─────────────────────────────────────────────────
export async function fetchDesafios() {
  const { data, error } = await supabase
    .from('desafios')
    .select('*')
    .neq('status', 'rascunho')
    .order('created_at', { ascending: false })
    .limit(30);   // o RLS já filtra: oficiais + os meus + os que eu participo
  if (error) throw new Error(error.message || 'Erro ao carregar desafios');
  return data || [];
}
export async function createDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo,
                                      modalidade, codigo, prenda, dataInicio, dataFim }) {
  const { data, error } = await supabase.from('desafios').insert({
    titulo, descricao,
    dias_total: dias || null,
    meta_diaria: meta || null,
    unidade: unidade || null,
    prova_opcoes: (opcoes && opcoes.length) ? opcoes : null,
    tipo: tipo || null,
    modalidade: modalidade || 'oficial',
    codigo: codigo || null,
    prenda: prenda || null,
    data_inicio: dataInicio || null,
    data_fim: dataFim || null,
  }).select('id').single();
  if (error) throw new Error(error.message || 'Não foi possível publicar');
  return data?.id;
}
export async function updateDesafio(id, { titulo, descricao, dias, meta, unidade, opcoes, tipo,
                                          prenda, dataInicio, dataFim }) {
  const patch = {
    titulo, descricao,
    dias_total: dias || null,
    meta_diaria: meta || null,
    unidade: unidade || null,
    prova_opcoes: (opcoes && opcoes.length) ? opcoes : null,
    prenda: prenda || null,
    data_inicio: dataInicio || null,
    data_fim: dataFim || null,
  };
  if (tipo !== undefined) patch.tipo = tipo || null;
  const { error } = await supabase.from('desafios').update(patch).eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível editar');
}

// Entra num desafio de amigos pelo código (RPC SECURITY DEFINER no banco —
// o convidado não consegue "ver" o desafio antes de entrar).
export async function entrarPorCodigo(codigo, nome) {
  const { data, error } = await supabase.rpc('entrar_por_codigo', {
    p_codigo: String(codigo || '').trim().toUpperCase(),
    p_nome: nome || null,
  });
  if (error) throw new Error(error.message?.includes('Código inválido') ? 'Código inválido 🤔' : (error.message || 'Erro ao entrar'));
  return data;
}
export async function deleteDesafio(id) {
  const { error } = await supabase.from('desafios').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível apagar');
}

// ── Participação + check-ins (aba) ───────────────────────────
// Placar público dos desafios OFICIAIS: agregado, SEM nomes.
// É o que quem está de fora pode ver — "18 participando · 82% em dia".
// Quem está dentro (ranking com nomes) é segredo de quem entrou.
export async function fetchPlacar() {
  const { data, error } = await supabase.rpc('placar_oficiais');
  if (error) return {};
  const map = {};
  (data || []).forEach(r => {
    const total = Number(r.participantes) || 0;
    const emDia = Number(r.em_dia) || 0;
    map[r.desafio_id] = { total, emDia, pct: total ? Math.round((emDia / total) * 100) : 0 };
  });
  return map;
}

export async function fetchParticipantes() {
  const { data } = await supabase.from('desafio_participantes').select('desafio_id, user_id, nome');
  return data || [];
}
export async function fetchCheckins() {
  const { data } = await supabase.from('desafio_checkins').select('desafio_id, user_id, dia, quantidade');
  return data || [];
}
export async function joinDesafio(desafioId, nome) {
  const { error } = await supabase.from('desafio_participantes').insert({ desafio_id: desafioId, nome: nome || null });
  if (error) throw new Error(error.message || 'Erro ao entrar');
}
export async function leaveDesafio(desafioId) {
  const uid = auth.currentUser?.uid;
  const { error } = await supabase.from('desafio_participantes').delete().eq('desafio_id', desafioId).eq('user_id', uid);
  if (error) throw new Error(error.message || 'Erro ao sair');
}
export async function addCheckin(desafioId, quantidade) {
  const { error } = await supabase.from('desafio_checkins').insert({ desafio_id: desafioId, quantidade: quantidade || 1 });
  if (error) throw new Error(error.message || 'Erro ao registrar');
}

// ── Bolinha de novo na Home ──────────────────────────────────
export async function loadDesafiosDot() {
  const dot = document.getElementById('desafios-dot');
  if (!dot) return;
  try {
    const list = await fetchDesafios();
    const seen = _seen();
    // A bolinha é sobre a vitrine — só desafios oficiais (os públicos)
    const novos = list.filter(d => d.modalidade === 'oficial' && !seen.has(d.id)).length;
    dot.style.display = novos > 0 ? '' : 'none';
  } catch {
    dot.style.display = 'none';
  }
}
