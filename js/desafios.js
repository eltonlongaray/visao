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
function _extrasDesafio({ prova, exercicios, maxPorDia, series, naoRepetir, regrasDono, horaLimite, corridasSemana, kmCorrida, corridaModo, turmaId, rodada }) {
  const x = {};
  if (turmaId) x.turma_id = turmaId;   // nova rodada do mesmo grupo (migration/desafios-rodadas.sql)
  if (rodada) x.rodada = rodada;
  if (prova !== undefined) x.prova = prova || null;
  if (exercicios !== undefined) x.exercicios = (exercicios && exercicios.length) ? exercicios : null;
  if (maxPorDia !== undefined) x.max_por_dia = maxPorDia || null;
  if (series !== undefined) x.series = series > 1 ? Math.min(5, series) : null;   // migration/desafios-series.sql
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
// Convite ainda vale? Só até o 1º dia do desafio (Élton, 18/10).
// false = já começou; true também quando o banco ainda não tem a função.
export async function conviteAberto(codigo) {
  const { data, error } = await supabase.rpc('desafio_convite_aberto', { p_codigo: String(codigo || '').trim().toUpperCase() });
  return error ? true : data !== false;
}
export const MSG_CONVITE_FECHADO = 'Esse desafio já começou: não dá mais pra entrar. Fica pra próxima rodada 🦅';
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

// desafioId: só os desse desafio (a sala do grupo não precisa dos outros)
const _doDesafio = (q, desafioId) => (desafioId ? q.eq('desafio_id', desafioId) : q);
export async function fetchParticipantes(desafioId) {
  const { data, error } = await _doDesafio(supabase.from('desafio_participantes').select('desafio_id, user_id, nome, joined_at'), desafioId);
  if (!error) return data || [];
  const r = await _doDesafio(supabase.from('desafio_participantes').select('desafio_id, user_id, nome'), desafioId);
  return r.data || [];
}
export async function fetchCheckins(desafioId) {
  const { data, error } = await _doDesafio(supabase.from('desafio_checkins')
    .select('id, desafio_id, user_id, dia, quantidade, exercicio, video_path, print_path, video_expira_em, created_at, conteudo'), desafioId);
  if (!error) return data || [];
  // Banco ainda sem o "Conteúdo" (migration/desafios-provas-conteudo.sql)
  const r0 = await _doDesafio(supabase.from('desafio_checkins')
    .select('id, desafio_id, user_id, dia, quantidade, exercicio, video_path, print_path, video_expira_em, created_at'), desafioId);
  if (!r0.error) return r0.data || [];
  // Banco ainda sem as colunas da prova: lê o básico pra não zerar o ranking
  const r = await _doDesafio(supabase.from('desafio_checkins').select('desafio_id, user_id, dia, quantidade'), desafioId);
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
  if (extra.doente) { row.doente = true; row.quantidade = 0; }   // dia justificado
  // Devolve o id do check-in (o "📄 Conteúdo" do depoimento grava nele)
  const { data, error } = await supabase.from('desafio_checkins').insert(row).select('id').maybeSingle();
  if (error) throw new Error(error.message || 'Erro ao registrar');
  // Quem conectou o Drive: o vídeo vai sozinho pra pasta dele (segundo plano)
  if (row.video_path && data?.id) import('./drive-provas.js').then(m => m.enviarProvaDrive(data.id)).catch(() => {});
  return data?.id || null;
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
// Vídeo grande sobe em PARTES de até 45 MB (o plano grátis do Supabase aceita
// 50 MB por arquivo): a primeira no caminho principal, que termina em -nN
// (N = quantas partes), e as outras em <caminho>.p2, .p3... Juntando as
// partes na ordem, volta o vídeo original, sem perder qualidade (Élton, 16/10).
const PARTE = 45 * 1024 * 1024;
const MAX_PARTES = 8;
export const partesDoVideo = (caminho) => {
  const n = Number((/-n(\d+)\.[a-z0-9]+$/i.exec(caminho || '') || [])[1] || 1);
  return n > 1 ? [caminho, ...Array.from({ length: n - 1 }, (_, i) => `${caminho}.p${i + 2}`)] : [caminho];
};
export async function subirProva(blob, tipo) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sessão expirada');
  const n = Math.max(1, Math.ceil(blob.size / PARTE));
  if (n > MAX_PARTES) throw new Error('Vídeo grande demais. Grava um mais curto.');
  const mime = (blob.type || '').split(';')[0] || (tipo === 'print' ? 'image/jpeg' : 'video/webm');
  const ext = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg' }[mime] || '.webm';
  const caminho = `${uid}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${n > 1 ? `-n${n}` : ''}${ext}`;
  const partes = partesDoVideo(caminho);
  const feitas = [];
  try {
    for (let i = 0; i < partes.length; i++) {
      const pedaco = n > 1 ? blob.slice(i * PARTE, (i + 1) * PARTE, mime) : blob;
      const { error } = await supabase.storage.from('desafio-provas').upload(partes[i], pedaco, { contentType: mime });
      if (error) throw new Error(error.message || 'Não deu pra enviar a prova');
      feitas.push(partes[i]);
    }
  } catch (e) {
    if (feitas.length) supabase.storage.from('desafio-provas').remove(feitas).catch(() => {});
    throw e;
  }
  return caminho;
}
// Vídeo em partes: baixa todas e junta num só (fica guardado enquanto o app está aberto)
const _juntados = new Map();
// Guarda a promessa: quem pedir o mesmo vídeo enquanto baixa espera o mesmo download
function _juntar(caminho, urls) {
  if (_juntados.has(caminho)) return _juntados.get(caminho);
  const p = (async () => {
    const pedacos = await Promise.all(urls.map(async u => { const r = await fetch(u); if (!r.ok) throw new Error('parte'); return r.blob(); }));
    return URL.createObjectURL(new Blob(pedacos, { type: pedacos[0]?.type || 'video/mp4' }));
  })();
  _juntados.set(caminho, p);
  p.catch(() => _juntados.delete(caminho));
  return p;
}
export async function assinarProvas(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const todos = unicos.flatMap(partesDoVideo);
  const { data, error } = await supabase.storage.from('desafio-provas').createSignedUrls(todos, 60 * 60);
  if (error) return new Map();
  const assin = new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  const res = new Map();
  await Promise.all(unicos.map(async c => {
    const partes = partesDoVideo(c);
    if (partes.length === 1) { if (assin.has(c)) res.set(c, assin.get(c)); return; }
    if (!partes.every(p => assin.has(p))) return;
    try { res.set(c, await _juntar(c, partes.map(p => assin.get(p)))); } catch { /* sem o vídeo */ }
  }));
  return res;
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
      if (c.video_path) partesDoVideo(c.video_path).forEach(p => usados.add(p));
      if (c.print_path) usados.add(c.print_path);
    });
    // Vídeo da prenda no mural (7 dias) também fica
    const { data: prendas, error: e2 } = await supabase.from('desafio_prendas').select('video_path').eq('user_id', uid);
    if (e2) return;
    (prendas || []).forEach(p => p.video_path && partesDoVideo(p.video_path).forEach(x => usados.add(x)));
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
