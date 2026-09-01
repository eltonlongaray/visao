// ─── ÍNDICE ──────────────────────────────────────────────────
// Funções de dados da AGENDA PÚBLICA (sem login). Isoladas aqui pra que a
// página leve (agenda.html → agenda-lite.js) só carregue o supabase, e NÃO o
// app inteiro (nada de auth, banco-dados, roteador…). agenda.js re-exporta.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// Lê a agenda de um dono pelo slug (só o que é público: título, duração, dias).
// `semanas` (exceções por semana) é opcional: se a coluna ainda não existir no
// banco, cai no select sem ela pra NÃO derrubar o link público.
export async function getAgendaPublica(slug) {
  const s = (slug || '').trim();
  let res = await supabase.from('agenda_config')
    .select('slug, titulo, endereco, duracao_min, disponibilidade, semanas, ativo, servicos')
    .eq('slug', s).eq('ativo', true).maybeSingle();
  if (res.error && /semanas/i.test(res.error.message || '')) {
    res = await supabase.from('agenda_config')
      .select('slug, titulo, endereco, duracao_min, disponibilidade, ativo, servicos')
      .eq('slug', s).eq('ativo', true).maybeSingle();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data || null;
}

// Slots já ocupados (data+hora), via RPC que NÃO expõe nome/contato do cliente.
export async function getSlotsOcupados(slug, deISO, ateISO) {
  const { data, error } = await supabase.rpc('slots_ocupados', { p_slug: slug, p_from: deISO, p_to: ateISO });
  if (error) throw new Error(error.message);
  const set = new Set();
  for (const r of data || []) set.add(`${r.data}|${r.hora}`);
  return set;
}

// Cria um agendamento via RPC (valida disponibilidade + não estar ocupado).
export async function criarAgendamento(slug, dataISO, hora, nome, contato, servicoId) {
  const { data, error } = await supabase.rpc('criar_agendamento', {
    p_slug: slug, p_data: dataISO, p_hora: hora,
    p_nome: (nome || '').trim().slice(0, 120),
    p_contato: (contato || '').trim().slice(0, 60),
    p_servico_id: servicoId || null,
  });
  if (error) throw new Error(error.message);
  // Avisa o DONO por push (notificação no celular, mesmo com o app fechado).
  try { _avisarDono(data?.owner_id, { nome, dataISO, hora }); } catch {}
  return data;
}

// ── Push pro dono quando um cliente agenda ────────────────────
// Reusa o Worker de push (mesma infra dos lembretes). A chave já é pública
// (vai no bundle do app). Dispara um /schedule quase imediato pro userId do dono.
const _WORKER_URL = 'https://visao-push-worker.eltonvisao.workers.dev';
const _WORKER_API_KEY = 'yL1qvOpajATNWrhB2l8ZutoRPU6MJ4QmCeIFY9n0';
async function _avisarDono(ownerId, { nome, dataISO, hora }) {
  if (!ownerId) return;
  try {
    const [y, m, d] = (dataISO || '').split('-');
    const dataBr = (d && m) ? `${d}/${m}` : dataISO;
    await fetch(`${_WORKER_URL}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _WORKER_API_KEY },
      body: JSON.stringify({
        userId: ownerId,
        title: '📅 Novo agendamento!',
        body: `${(nome || 'Um cliente').trim()} marcou pra ${dataBr} às ${hora}`,
        tag: `visao-${dataISO}-ag-${(hora || '').replace(':', '')}`,
        timestamp: Date.now() + 2000,
      }),
    });
  } catch {}
}
