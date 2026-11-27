// ─── ÍNDICE ──────────────────────────────────────────────────
// Dados das FONTES DE RENDA (Caixa de Ferramentas). SQL: sql/renda-fontes.sql
// Cada pessoa monta as suas: cards que podem ter outros dentro (tipo 'grupo'),
// a 🎓 Mentoria (tela que já existe) ou uma lista de 👥 Clientes.
// BLOCO 1 — CONSTANTES (tipos, a fonte que já vem pronta)
// BLOCO 2 — FONTES
// BLOCO 3 — CLIENTES
// BLOCO 4 — AJUDANTES (achar pelo nome, caminho, dinheiro)
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// === BLOCO 1: CONSTANTES ===
export const TIPOS = [
  { k: 'clientes', nome: 'Clientes', icone: '👥', dica: 'Lista de clientes: fase, pagamento e próximo pagamento' },
  { k: 'grupo',    nome: 'Com divisões', icone: '📂', dica: 'Abre outros cards dentro (ex.: Mentoria e Agência)' },
  { k: 'mentoria', nome: 'Mentoria', icone: '🎓', dica: 'Inscritas, alunas e formulários' },
  { k: 'atendimentos', nome: 'Atendimentos', icone: '💆', dica: 'Quem marca horário pela Agenda Online: clientes, ficha e financeiro' },
];
export const tipoDe = (k) => TIPOS.find(t => t.k === k) || TIPOS[0];

// Quem nunca montou nada começa com a Mentoria (como era antes)
const INICIAIS = [{ nome: 'Mentoria', icone: '🎓', tipo: 'mentoria', ordem: 0 }];

const _erro = (e) => {
  const m = e?.message || '';
  if (/renda_(fontes|clientes)/i.test(m) && /does not exist|schema cache|relation/i.test(m)) return new Error('Falta rodar o SQL das Fontes de renda (sql/renda-fontes.sql)');
  if (/Limite de/.test(m)) return new Error(m.replace(/^.*?(Limite de[^"]*).*$/, '$1') + '.');
  return new Error(m || 'Erro');
};

// === BLOCO 2: FONTES ===
export async function lerFontes() {
  const { data, error } = await supabase.from('renda_fontes').select('*')
    .order('ordem', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw _erro(error);
  if (data && data.length) return data;
  const { data: novas, error: e2 } = await supabase.from('renda_fontes').insert(INICIAIS).select('*');
  if (e2) throw _erro(e2);
  return novas || [];
}

export const filhas = (fontes, paiId) => fontes.filter(f => (f.pai_id || null) === (paiId || null))
  .sort((a, b) => a.ordem - b.ordem);

export async function criarFonte({ nome, icone = '💼', tipo = 'clientes', pai_id = null }, fontes = []) {
  const irmas = filhas(fontes, pai_id);
  const ordem = irmas.length ? Math.max(...irmas.map(f => f.ordem)) + 1 : 0;
  const { data, error } = await supabase.from('renda_fontes')
    .insert({ nome: String(nome).trim().slice(0, 40), icone: String(icone || '💼').trim().slice(0, 16) || '💼', tipo, pai_id, ordem })
    .select('*').single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarFonte(id, patch) {
  if (patch.nome != null) patch.nome = String(patch.nome).trim().slice(0, 40);
  const { error } = await supabase.from('renda_fontes').update(patch).eq('id', id);
  if (error) throw _erro(error);
}

// Apaga o card, os de dentro e os clientes deles (o banco apaga em cascata)
export async function apagarFonte(id) {
  const { error } = await supabase.from('renda_fontes').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 3: CLIENTES ===
export async function lerClientes(fonteId = null) {
  let q = supabase.from('renda_clientes').select('*');
  if (fonteId) q = q.eq('fonte_id', fonteId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

const _limpaCliente = (c) => {
  const o = {};
  if (c.nome != null) o.nome = String(c.nome).trim().slice(0, 80);
  if (c.contato !== undefined) o.contato = String(c.contato || '').trim().slice(0, 40) || null;
  if (c.fase !== undefined) o.fase = String(c.fase || '').trim().slice(0, 80) || null;
  if (c.notas !== undefined) o.notas = String(c.notas || '').trim().slice(0, 2000) || null;
  for (const k of ['valor_pago', 'proximo_valor']) if (c[k] !== undefined) o[k] = dinheiro(c[k]);
  if (c.proximo_em !== undefined) o.proximo_em = c.proximo_em || null;
  if (c.jornada !== undefined) o.jornada = c.jornada || null;   // proposta, fases e relatório (cliente-relatorio.js)
  return o;
};

export async function criarCliente(fonteId, c) {
  const linha = { fonte_id: fonteId, ..._limpaCliente(c) };
  if (!linha.nome) throw new Error('Coloque o nome do cliente');
  const { data, error } = await supabase.from('renda_clientes').insert(linha).select('*').single();
  if (error) throw _erro(error);
  return data;
}

export async function mudarCliente(id, patch) {
  const p = _limpaCliente(patch);
  if (patch.fonte_id) p.fonte_id = patch.fonte_id;
  if ('nome' in p && !p.nome) throw new Error('Coloque o nome do cliente');
  const { error } = await supabase.from('renda_clientes').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw _erro(error);
}

export async function apagarCliente(id) {
  const { error } = await supabase.from('renda_clientes').delete().eq('id', id);
  if (error) throw _erro(error);
}

// === BLOCO 4: AJUDANTES ===
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// "Realeza › Agência de marketing"
export function caminho(fontes, f) {
  const nomes = [];
  for (let x = f, i = 0; x && i < 10; x = fontes.find(y => y.id === x.pai_id), i++) nomes.unshift(x.nome);
  return nomes.join(' › ');
}

// Acha pelo nome falado: igual > começa com > contém. Só do tipo pedido, se tiver.
export function acharFonte(fontes, falado, tipo = null) {
  const a = norm(falado);
  if (!a) return null;
  const l = tipo ? fontes.filter(f => f.tipo === tipo) : fontes;
  return l.find(f => norm(f.nome) === a) || l.find(f => norm(f.nome).startsWith(a) || a.startsWith(norm(f.nome)))
    || l.find(f => norm(f.nome).includes(a) || a.includes(norm(f.nome))) || null;
}

// "1.200", "1200,50", "R$ 350" → número (ou null)
export function dinheiro(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
export const reais = (v) => v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (d) => d ? d.split('-').reverse().join('/') : '';
