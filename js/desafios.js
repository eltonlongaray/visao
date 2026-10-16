// ═══════════════════════════════════════════════════════════════
// FALCON · Desafios — camada de dados (Supabase) + bolinha da Home
// A UI vive em screens/tela-desafios.js. Moldes em desafios-moldes.js.
// Sem dinheiro. RLS admin via profiles.is_admin.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { deixarVideoLeve } from './video-leve.js';
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
function _extrasDesafio({ prova, exercicios, maxPorDia, naoRepetir, regrasDono, horaLimite, corridasSemana, kmCorrida, corridaModo, turmaId, rodada }) {
  const x = {};
  if (turmaId) x.turma_id = turmaId;   // nova rodada do mesmo grupo (migration/desafios-rodadas.sql)
  if (rodada) x.rodada = rodada;
  if (prova !== undefined) x.prova = prova || null;
  if (exercicios !== undefined) x.exercicios = (exercicios && exercicios.length) ? exercicios : null;
  if (maxPorDia !== undefined) x.max_por_dia = maxPorDia || null;
  if (naoRepetir !== undefined) x.nao_repetir = !!naoRepetir;
  if (regrasDono !== undefined) x.regras_dono = (regrasDono || '').trim() || null;
  if (horaLimite !== undefined) x.hora_limite = horaLimite || null;
  if (corridasSemana !== undefined) x.corridas_semana = corridasSemana || null;   // migration/desafios-corrida-semana.sql
  if (kmCorrida !== undefined) x.km_corrida = kmCorrida || null;
  if (corridaModo !== undefined) x.corrida_modo = corridaModo || null;
  return x;
}
export async function createDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo,
                                      modalidade, codigo, prenda, dataInicio, dataFim, ...extras }) {
  const linha = {
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
  };
  let { data, error } = await supabase.from('desafios').insert(linha).select('id').single();
  // Banco ainda sem as colunas da rodada: cria o desafio sem elas
  if (error && /turma_id|rodada/.test(error.message || '') && ('turma_id' in linha || 'rodada' in linha)) {
    delete linha.turma_id; delete linha.rodada;
    ({ data, error } = await supabase.from('desafios').insert(linha).select('id').single());
  }
  if (error) throw new Error(error.message || 'Não foi possível publicar');
  return data?.id;
}
export async function updateDesafio(id, campos) {
  const { error } = await supabase.from('desafios').update(patchDesafio(campos)).eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível editar');
}
// Os campos do formulário em colunas do banco (edição e proposta usam o mesmo)
export function patchDesafio({ titulo, descricao, dias, meta, unidade, opcoes, tipo,
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
  return patch;
}

// ── Mudar a regra com gente dentro: proposta pro grupo aceitar ──
// (migration/desafios-propostas.sql). Só vale com o aceite de todos.
export async function proporMudanca(desafioId, mudancas, resumo) {
  const { error } = await supabase.from('desafio_propostas').insert({ desafio_id: desafioId, mudancas, resumo });
  if (error) {
    if (/uma_aberta|duplicate/i.test(error.message || '')) throw new Error('Já tem uma proposta esperando o grupo responder.');
    throw new Error(error.message || 'Não deu pra mandar a proposta');
  }
}
// Propostas do desafio com os votos: [{ ..., votos: [{ user_id, aceito }] }]
export async function fetchPropostas(desafioId) {
  const { data, error } = await supabase.from('desafio_propostas')
    .select('id, desafio_id, autor_id, mudancas, resumo, status, expira_em, created_at, desafio_proposta_votos(user_id, aceito)')
    .eq('desafio_id', desafioId);
  if (error) return [];
  return (data || []).map(p => ({ ...p, votos: p.desafio_proposta_votos || [] }));
}
export async function votarProposta(propostaId, aceito) {
  const { error } = await supabase.from('desafio_proposta_votos').insert({ proposta_id: propostaId, aceito: !!aceito });
  if (error) throw new Error(/duplicate/i.test(error.message || '') ? 'Tu já respondeu essa proposta.' : (error.message || 'Não deu pra responder'));
}
export async function cancelarProposta(propostaId) {
  const { error } = await supabase.rpc('desafio_proposta_cancelar', { p_id: propostaId });
  if (error) throw new Error(error.message || 'Não deu pra cancelar');
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
  const { data, error } = await supabase.from('desafio_participantes').select('desafio_id, user_id, nome, joined_at');
  if (!error) return data || [];
  const r = await supabase.from('desafio_participantes').select('desafio_id, user_id, nome');
  return r.data || [];
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
// Sair só com motivo (Élton, 15/10): o motivo vai pra sala e pro relatório,
// e quem sai não volta nessa rodada (banco: sair_do_desafio).
export async function leaveDesafio(desafioId, motivo) {
  const m = String(motivo || '').trim();
  if (m.length < 3) throw new Error('Escreve o motivo pra sair do desafio.');
  const { error } = await supabase.rpc('sair_do_desafio', { p_desafio: desafioId, p_motivo: m });
  if (!error) return;
  // Banco ainda sem a função: sai do jeito antigo
  if (/sair_do_desafio|PGRST202|function/i.test(error.message || '') && !/motivo|não está/i.test(error.message || '')) {
    const uid = auth.currentUser?.uid;
    const r = await supabase.from('desafio_participantes').delete().eq('desafio_id', desafioId).eq('user_id', uid);
    if (r.error) throw new Error(r.error.message || 'Erro ao sair');
    return;
  }
  throw new Error(error.message || 'Erro ao sair');
}
// Quem desistiu (com o motivo): pro relatório
export async function fetchSaidas() {
  const { data, error } = await supabase.from('desafio_saidas').select('desafio_id, user_id, nome, motivo, saiu_em');
  return error ? [] : (data || []);
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

// Apagar a PRÓPRIA prova de hoje (Élton, 16/10): some o check-in, e com ele a
// mensagem na sala (cascade), e dá pra gravar de novo. O vídeo sai na faxina.
export async function apagarCheckin(id) {
  const uid = auth.currentUser?.uid;
  const { error } = await supabase.from('desafio_checkins').delete().eq('id', id).eq('user_id', uid);
  if (error) throw new Error(error.message || 'Não deu pra apagar a prova');
}

// ── Provas (vídeo ao vivo e print da corrida) ────────────────
// Bucket privado: guarda o caminho, a URL é assinada na hora de ver.
const LIMITE_PROVA = 50 * 1024 * 1024;   // bucket desafio-provas
export async function subirProva(blob, tipo) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sessão expirada');
  // Vídeo acima do limite: o app deixa mais leve antes (video-leve.js)
  if (blob.size > LIMITE_PROVA && tipo !== 'print') {
    const leve = await deixarVideoLeve(blob);
    if (!leve) throw new Error('O vídeo ficou grande demais e não deu pra deixar mais leve. Grava de novo, ele sai menor.');
    blob = leve;
  }
  if (blob.size > LIMITE_PROVA) throw new Error('Vídeo grande demais (máx 50 MB).');
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
// (o vídeo fica até 7 dias depois do fim do desafio; o check-in fica pro ranking).
export async function faxinaProvas() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const { data: arqs, error } = await supabase.storage.from('desafio-provas').list(uid, { limit: 200 });
    if (error || !arqs?.length) return;
    const { data: vivos, error: e1 } = await supabase.from('desafio_checkins')
      .select('video_path, print_path, video_expira_em').eq('user_id', uid);
    // Sem a lista dos check-ins não dá pra saber o que está em uso: não apaga nada
    if (e1 || !Array.isArray(vivos)) return;
    const agora = Date.now();
    const usados = new Set();
    (vivos || []).forEach(c => {
      if (c.video_expira_em && new Date(c.video_expira_em).getTime() < agora) return;
      if (c.video_path) usados.add(c.video_path);
      if (c.print_path) usados.add(c.print_path);
    });
    // Vídeo da prenda no mural (7 dias) também fica
    const { data: prendas, error: e2 } = await supabase.from('desafio_prendas').select('video_path').eq('user_id', uid);
    if (e2) return;
    (prendas || []).forEach(p => p.video_path && usados.add(p.video_path));
    // arquivo de menos de 1 dia pode ser a corrida pela metade (vídeo já subiu, falta o print)
    const lixo = arqs.filter(a => !usados.has(`${uid}/${a.name}`) && agora - new Date(a.created_at || 0).getTime() > 864e5)
      .map(a => `${uid}/${a.name}`);
    if (lixo.length) await supabase.storage.from('desafio-provas').remove(lixo);
  } catch { /* acessória */ }
}

// ── Mural das prendas (migration/desafios-prendas.sql) ───────
// Prendas no ar (7 dias) + as minhas (mesmo vencidas, pra saber que já
// paguei), da mais nova pra mais velha. Todo mundo vê as do ar.
export async function fetchPrendas() {
  const { data, error } = await supabase.from('desafio_prendas')
    .select('id, desafio_id, user_id, nome, titulo, prenda, video_path, created_at, expira_em')
    .order('created_at', { ascending: false }).limit(80);
  return error ? [] : (data || []);
}
// Nome e prenda de um desafio de amigos pelo código, antes de entrar
export async function fetchPrevia(codigo) {
  const { data, error } = await supabase.rpc('desafio_previa_codigo', { p_codigo: String(codigo || '').trim().toUpperCase() });
  return error ? null : (Array.isArray(data) ? data[0] : data) || null;
}
// Manda a prenda gravada: sobe o vídeo e põe no mural
export async function enviarPrenda(desafioId, blob) {
  const videoPath = await subirProva(blob, 'prenda');
  const { error } = await supabase.from('desafio_prendas').insert({ desafio_id: desafioId, video_path: videoPath });
  if (error) {
    supabase.storage.from('desafio-provas').remove([videoPath]).catch(() => {});
    if (/duplicate|unique/i.test(error.message || '')) throw new Error('Tu já cumpriu essa prenda 🎭');
    if (/relation|does not exist|schema cache/i.test(error.message || '')) throw new Error('O mural das prendas ainda não foi ligado no banco.');
    throw new Error(error.message || 'Não deu pra enviar a prenda');
  }
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
