// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados do FINANCEIRO do cliente (lado da PROFISSIONAL, logada):
//   vendas (o que cada cliente comprou/pagou), financeiro_cfg (custos dos
//   serviços + produtos) e campanhas (investimento por anúncio).
// Só cálculo e banco — sem tela (a tela é financeiro-ui.js). SQL: sql/financeiro.sql
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

// === BLOCO 1: AJUDANTES ===
const _uid = () => auth.currentUser?.uid || null;
export const digitos = s => String(s || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const _sqlErro = (e, tabela) => new Error(new RegExp(tabela, 'i').test(e?.message || '') && /does not exist|schema cache|relation/i.test(e?.message || '')
  ? 'Falta rodar o SQL do financeiro (sql/financeiro.sql)' : (e?.message || 'Erro'));

// === BLOCO 2: VENDAS ===
export async function getVendas() {
  const { data, error } = await supabase.from('vendas').select('*')
    .order('data', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw _sqlErro(error, 'vendas');
  return data || [];
}
export async function salvarVenda(v) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const row = {
    owner_id: uid, cliente_nome: v.cliente_nome || null, cliente_contato: v.cliente_contato || null,
    cliente_digitos: digitos(v.cliente_contato) || v.cliente_digitos || null,
    tipo: v.tipo || 'servico', item: (v.item || '').trim() || 'Venda', servico_id: v.servico_id || null,
    agendamento_id: v.agendamento_id || null, sessoes: Math.max(1, parseInt(v.sessoes, 10) || 1),
    valor: Number(v.valor) || 0, custo: Number(v.custo) || 0, forma: v.forma || null,
    data: v.data || new Date().toISOString().slice(0, 10), obs: (v.obs || '').trim() || null,
  };
  const q = v.id ? supabase.from('vendas').update(row).eq('id', v.id) : supabase.from('vendas').insert(row);
  const { data, error } = await q.select('*').single();
  if (error) throw _sqlErro(error, 'vendas');
  return data;
}
export async function excluirVenda(id) {
  const { error } = await supabase.from('vendas').delete().eq('id', id);
  if (error) throw _sqlErro(error, 'vendas');
}

// === BLOCO 3: CUSTOS DOS SERVIÇOS + PRODUTOS ===
export async function getFinCfg() {
  const { data, error } = await supabase.from('financeiro_cfg').select('custos, produtos').maybeSingle();
  if (error) throw _sqlErro(error, 'financeiro_cfg');
  return { custos: data?.custos || {}, produtos: Array.isArray(data?.produtos) ? data.produtos : [] };
}
export async function salvarFinCfg(cfg) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const { error } = await supabase.from('financeiro_cfg')
    .upsert({ owner_id: uid, custos: cfg.custos || {}, produtos: cfg.produtos || [], updated_at: new Date().toISOString() });
  if (error) throw _sqlErro(error, 'financeiro_cfg');
}

// === BLOCO 4: CAMPANHAS ===
export async function getCampanhas() {
  const { data, error } = await supabase.from('campanhas').select('*').order('created_at', { ascending: false });
  if (error) throw _sqlErro(error, 'campanhas');
  return data || [];
}
export async function salvarCampanha(c) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const row = { owner_id: uid, codigo: c.codigo, nome: c.nome || null, origem: c.origem || null,
    investido: Number(c.investido) || 0, inicio: c.inicio || null, fim: c.fim || null };
  const { data, error } = await supabase.from('campanhas').upsert(row, { onConflict: 'owner_id,codigo' }).select('*').single();
  if (error) throw _sqlErro(error, 'campanhas');
  return data;
}

// === BLOCO 5: CÁLCULOS ===
// Pacotes de um cliente: sessões feitas (atendimentos finalizados do mesmo serviço
// desde a compra), faltando e o próximo atendimento marcado.
const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export function pacotesDoCliente(vendasCli, agsCli) {
  const hoje = new Date().toISOString().slice(0, 10);
  return vendasCli.filter(v => v.tipo === 'pacote').map(v => {
    const doServ = a => _norm(a.servico) === _norm(v.item) || (_norm(a.servico).includes(_norm(v.item).split(' (')[0]) && _norm(v.item));
    const feitas = agsCli.filter(a => a.status === 'finalizado' && a.data >= v.data && doServ(a)).length;
    const prox = agsCli.filter(a => a.status === 'confirmado' && a.data >= hoje)
      .sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1))[0] || null;
    const total = v.sessoes || 1;
    return { venda: v, total, feitasReal: feitas, feitas: Math.min(feitas, total), faltam: Math.max(0, total - feitas), prox, ativo: feitas < total };
  });
}
// Total pago e lucro de uma lista de vendas
export function somar(vendas) {
  const bruto = vendas.reduce((t, v) => t + (Number(v.valor) || 0), 0);
  const custo = vendas.reduce((t, v) => t + (Number(v.custo) || 0), 0);
  return { bruto, custo, lucro: bruto - custo, qtd: vendas.length };
}
// Resumo por mês (AAAA-MM), do mais recente pro mais antigo
export function porMes(vendas) {
  const m = new Map();
  for (const v of vendas) {
    const k = String(v.data || '').slice(0, 7); if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([mes, vs]) => ({ mes, ...somar(vs), vendas: vs }));
}
