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
// Campos da prova/exercícios/regras (migration/desafios-provas.sql). Só entram
// quando vêm definidos: um formulário antigo não manda e não quebra.
function _extrasDesafio({ prova, exercicios, maxPorDia, naoRepetir, regrasDono, horaLimite }) {
  const x = {};
  if (prova !== undefined) x.prova = prova || null;
  if (exercicios !== undefined) x.exercicios = (exercicios && exercicios.length) ? exercicios : null;
  if (maxPorDia !== undefined) x.max_por_dia = maxPorDia || null;
  if (naoRepetir !== undefined) x.nao_repetir = !!naoRepetir;
  if (regrasDono !== undefined) x.regras_dono = (regrasDono || '').trim() || null;
  if (horaLimite !== undefined) x.hora_limite = horaLimite || null;
  return x;
}
export async function createDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo,
                                      modalidade, codigo, prenda, dataInicio, dataFim, ...extras }) {
  const { data, error } = await supabase.from('desafios').insert({
    ..._extrasDesafio(extras),
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
                                          prenda, dataInicio, dataFim, ...extras }) {
  const patch = {
    ..._extrasDesafio(extras),
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
  const { data, error } = await supabase.from('desafio_checkins')
    .select('id, desafio_id, user_id, dia, quantidade, exercicio, video_path, print_path, video_expira_em, created_at');
  if (!error) return data || [];
  // Banco ainda sem as colunas da prova: lê o básico pra não zerar o ranking
  const r = await supabase.from('desafio_checkins').select('desafio_id, user_id, dia, quantidade');
  return r.data || [];
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
// extra = { exercicio, videoPath, printPath } — as regras do desafio (prova,
// limite por dia, não repetir) são conferidas no banco e voltam como erro.
export async function addCheckin(desafioId, quantidade, extra = {}) {
  const row = { desafio_id: desafioId, quantidade: quantidade === 0 ? 0 : (quantidade || 1) };   // 0 = largar um vício, dia que não conseguiu
  if (extra.exercicio) row.exercicio = extra.exercicio;
  if (extra.videoPath) row.video_path = extra.videoPath;
  if (extra.printPath) row.print_path = extra.printPath;
  const { error } = await supabase.from('desafio_checkins').insert(row);
  if (error) throw new Error(error.message || 'Erro ao registrar');
}

// ── Provas (vídeo ao vivo e print da corrida) ────────────────
// Bucket privado: guarda o caminho, a URL é assinada na hora de ver.
export async function subirProva(blob, tipo) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sessão expirada');
  if (blob.size > 25 * 1024 * 1024) throw new Error('Arquivo grande demais (máx 25 MB).');
  const mime = (blob.type || '').split(';')[0] || (tipo === 'print' ? 'image/jpeg' : 'video/webm');
  const ext = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg' }[mime] || '.webm';
  const caminho = `${uid}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await supabase.storage.from('desafio-provas').upload(caminho, blob, { contentType: mime });
  if (error) throw new Error(error.message || 'Não deu pra enviar a prova');
  return caminho;
}
export async function assinarProvas(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await supabase.storage.from('desafio-provas').createSignedUrls(unicos, 60 * 60);
  if (error) return new Map();
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}
// Apaga da MINHA pasta o que não está preso a um check-in que ainda vale
// (o vídeo some em 7 dias; o check-in fica pro ranking).
export async function faxinaProvas() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const { data: arqs, error } = await supabase.storage.from('desafio-provas').list(uid, { limit: 200 });
    if (error || !arqs?.length) return;
    const { data: vivos } = await supabase.from('desafio_checkins')
      .select('video_path, print_path, video_expira_em').eq('user_id', uid);
    const agora = Date.now();
    const usados = new Set();
    (vivos || []).forEach(c => {
      if (c.video_expira_em && new Date(c.video_expira_em).getTime() < agora) return;
      if (c.video_path) usados.add(c.video_path);
      if (c.print_path) usados.add(c.print_path);
    });
    // arquivo de menos de 1 dia pode ser a corrida pela metade (vídeo já subiu, falta o print)
    const lixo = arqs.filter(a => !usados.has(`${uid}/${a.name}`) && agora - new Date(a.created_at || 0).getTime() > 864e5)
      .map(a => `${uid}/${a.name}`);
    if (lixo.length) await supabase.storage.from('desafio-provas').remove(lixo);
  } catch { /* acessória */ }
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
