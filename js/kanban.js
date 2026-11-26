// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados do KANBAN das tarefas do dia (Ferramentas). SQL: sql/kanban-tarefas.sql
// Só banco — sem tela (a tela é kanban-ui.js; o Pet usa daqui também).
// BLOCO 1 — CONSTANTES (cores com contraste garantido, modalidades iniciais)
// BLOCO 2 — MODALIDADES
// BLOCO 3 — TAREFAS (as 3 datas: criado, foi pra Fazendo, concluído)
// BLOCO 4 — AJUDANTES (datas, tempo que levou)
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: CONSTANTES ===
// Paleta fechada: cada cor já vem com a cor da letra que dá contraste ≥ 5:1
// (padrão AA de acessibilidade). A pessoa só escolhe daqui, então nunca fica ilegível.
export const CORES = [
  { k: 'azul',     fundo: '#1d4ed8', letra: '#ffffff', nome: 'Azul' },      // 6,7:1
  { k: 'roxo',     fundo: '#6d28d9', letra: '#ffffff', nome: 'Roxo' },      // 7,1:1
  { k: 'verde',    fundo: '#15803d', letra: '#ffffff', nome: 'Verde' },     // 5,0:1
  { k: 'laranja',  fundo: '#f59e0b', letra: '#111111', nome: 'Laranja' },   // 8,8:1
  { k: 'rosa',     fundo: '#be185d', letra: '#ffffff', nome: 'Rosa' },      // 6,0:1
  { k: 'vermelho', fundo: '#b91c1c', letra: '#ffffff', nome: 'Vermelho' },  // 6,5:1
  { k: 'ciano',    fundo: '#0e7490', letra: '#ffffff', nome: 'Ciano' },     // 5,4:1
  { k: 'amarelo',  fundo: '#facc15', letra: '#111111', nome: 'Amarelo' },   // 12,3:1
];
export const cor = (k) => CORES.find(c => c.k === k) || CORES[0];

// Prontas pra pessoa decidir o que fazer com elas (editar, apagar, somar outras)
export const MODALIDADES_INICIAIS = [
  { nome: '💼 Trabalho',  cor: 'azul' },
  { nome: '🎓 Faculdade', cor: 'roxo' },
  { nome: '🏠 Casa',      cor: 'verde' },
  { nome: '🙋 Pessoal',   cor: 'laranja' },
];

export const COLUNAS = [
  { k: 'afazer',  nome: 'A fazer' },
  { k: 'fazendo', nome: 'Fazendo' },
  { k: 'feito',   nome: 'Feito' },
];
export const nomeColuna = (k) => COLUNAS.find(c => c.k === k)?.nome || k;

const _erro = (e) => {
  const m = e?.message || '';
  if (/kanban_(modalidades|tarefas)/i.test(m) && /does not exist|schema cache|relation/i.test(m)) return new Error('Falta rodar o SQL do Kanban (sql/kanban-tarefas.sql)');
  if (/Limite de/.test(m)) return new Error(m.replace(/^.*?(Limite de[^"]*).*$/, '$1') + '.');
  return new Error(m || 'Erro');
};
const _agora = () => new Date().toISOString();

// === BLOCO 2: MODALIDADES ===
// Primeira vez (nenhuma modalidade): cria as 4 prontas.
export async function lerModalidades() {
  const { data, error } = await supabase.from('kanban_modalidades').select('*')
    .order('ordem', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw _erro(error);
  if (data && data.length) return data;
  const { data: novas, error: e2 } = await supabase.from('kanban_modalidades')
    .insert(MODALIDADES_INICIAIS.map((m, i) => ({ ...m, ordem: i }))).select('*');
  if (e2) throw _erro(e2);
  return (novas || []).sort((a, b) => a.ordem - b.ordem);
}

export async function criarModalidade(nome, corK, ordem) {
  const { data, error } = await supabase.from('kanban_modalidades')
    .insert({ nome: String(nome).trim().slice(0, 40), cor: corK, ordem }).select('*').single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarModalidade(id, patch) {
  if (patch.nome != null) patch.nome = String(patch.nome).trim().slice(0, 40);
  const { error } = await supabase.from('kanban_modalidades').update(patch).eq('id', id);
  if (error) throw _erro(error);
}

// Apaga a modalidade e as tarefas dela (o banco apaga em cascata)
export async function apagarModalidade(id) {
  const { error } = await supabase.from('kanban_modalidades').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 3: TAREFAS ===
// modId = null → todas (o Pet procura em todas as modalidades)
export async function lerTarefas(modId = null) {
  let q = supabase.from('kanban_tarefas').select('*');
  if (modId) q = q.eq('modalidade_id', modId);
  const { data, error } = await q.order('ordem', { ascending: true }).limit(5000);
  if (error) throw _erro(error);
  return data || [];
}

// Entra em cima da coluna (ordem menor que a de todas)
export async function criarTarefa({ modalidade_id, titulo, coluna = 'afazer' }, irmas = []) {
  const ordem = irmas.length ? Math.min(...irmas.map(x => x.ordem)) - 1 : 0;
  const agora = _agora();
  const linha = { modalidade_id, titulo: String(titulo).trim().slice(0, 300), coluna, ordem };
  if (coluna === 'fazendo') linha.fazendo_em = agora;
  if (coluna === 'feito') linha.feito_em = agora;
  const { data, error } = await supabase.from('kanban_tarefas').insert(linha).select('*').single();
  if (error) throw _erro(error);
  return data;
}

// As datas que mudam quando a tarefa troca de coluna. A data nova substitui a
// antiga; voltar pra "A fazer" limpa as duas (só o criado_em fica).
export function datasAoMover(t, coluna) {
  if (t.coluna === coluna) return {};
  const agora = _agora();
  if (coluna === 'afazer') return { fazendo_em: null, feito_em: null };
  if (coluna === 'fazendo') return { fazendo_em: agora, feito_em: null };
  return { feito_em: agora };   // feito: mantém quando começou, pra contar o tempo
}

export async function moverTarefa(t, coluna, ordem) {
  const patch = { coluna, ordem, updated_at: _agora(), ...datasAoMover(t, coluna) };
  const { error } = await supabase.from('kanban_tarefas').update(patch).eq('id', t.id);
  if (error) throw _erro(error);
  Object.assign(t, patch);
  return t;
}

export async function mudarTarefa(id, patch) {
  if (patch.titulo != null) patch.titulo = String(patch.titulo).trim().slice(0, 300);
  const { error } = await supabase.from('kanban_tarefas').update({ ...patch, updated_at: _agora() }).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarTarefa(id) {
  const { error } = await supabase.from('kanban_tarefas').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 4: AJUDANTES ===
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const _dia0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const _hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const _dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// "hoje", "ontem" ou "qua 25/11"
export function diaCurto(iso) {
  if (!iso) return '';
  const d = new Date(iso), dif = Math.round((_dia0(new Date()) - _dia0(d)) / 864e5);
  if (dif === 0) return 'hoje';
  if (dif === 1) return 'ontem';
  return `${DIAS[d.getDay()]} ${_dm(d)}`;
}
// "hoje 09:10" / "qua 25/11 14:02"
export const quando = (iso) => iso ? `${diaCurto(iso)} ${_hm(new Date(iso))}` : '';
export const hora = (iso) => iso ? _hm(new Date(iso)) : '';
// Cabeçalho do dia no Feito: "Hoje · qui 26/11"
export function rotuloDia(iso) {
  const d = new Date(iso), c = diaCurto(iso), base = `${DIAS[d.getDay()]} ${_dm(d)}`;
  return c === 'hoje' ? `Hoje · ${base}` : c === 'ontem' ? `Ontem · ${base}` : base;
}
export const chaveDia = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// Tempo entre ir pra Fazendo e concluir: "2h30", "45 min", "3 dias"
export function duracao(ms) {
  if (!(ms > 0)) return '';
  const min = Math.round(ms / 6e4);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  return `${Math.round(h / 24)} dias`;
}
export const levou = (t) => (t.fazendo_em && t.feito_em) ? duracao(new Date(t.feito_em) - new Date(t.fazendo_em)) : '';

// Linha curta embaixo do título, conforme a coluna
export function linhaCurta(t) {
  if (t.coluna === 'afazer') return `criado ${quando(t.criado_em)}`;
  if (t.coluna === 'fazendo') return t.fazendo_em ? `começou ${quando(t.fazendo_em)}` : `criado ${quando(t.criado_em)}`;
  const l = levou(t);
  return `concluído ${hora(t.feito_em)}${l ? ` · levou ${l}` : ''}`;
}
