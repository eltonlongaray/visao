// ─── ÍNDICE ──────────────────────────────────────────────────
// Camada de dados da 🎓 MENTORIA (lado da DONA — logada). Uma linha por pessoa em
// `mentoria_leads` (RLS: owner_id = auth.uid()). Os formulários públicos gravam pela
// RPC mentoria_enviar; aqui a dona lê, marca etapas, mensagens enviadas e presença.
// SQL: sql/mentoria.sql
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';

const _uid = () => auth.currentUser?.uid || null;
export const digitosDe = s => {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
};

// === BLOCO 1: LER ===
export async function getLeads() {
  const uid = _uid(); if (!uid) return [];
  const { data, error } = await supabase.from('mentoria_leads').select('*')
    .eq('owner_id', uid).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// === BLOCO 2: MUDAR / CRIAR / APAGAR ===
export async function salvarLead(id, patch) {
  const { error } = await supabase.from('mentoria_leads')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function criarLeadManual({ nome, contato }) {
  const uid = _uid(); if (!uid) throw new Error('Sessão expirada');
  const digitos = digitosDe(contato);
  if (String(nome || '').trim().length < 2) throw new Error('Coloque o nome');
  if (digitos.length < 10) throw new Error('Confira o WhatsApp com DDD');
  const { data, error } = await supabase.from('mentoria_leads')
    .insert({ owner_id: uid, nome: nome.trim(), contato: contato.trim(), digitos, origem: 'manual' })
    .select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function apagarLead(id) {
  const { error } = await supabase.from('mentoria_leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// === BLOCO 3: MODELO DA PROFISSIONAL (perguntas, oferta e mensagens) ===
// mentoria-modelos/<slug>.js — o mesmo arquivo que a página pública usa.
export function carregarModelo(slug) {
  return new Promise(res => {
    if (!slug) return res(null);
    if (window.MENTORIA_MODELO && window.__mentoriaSlug === slug) return res(window.MENTORIA_MODELO);
    const s = document.createElement('script');
    s.src = `/mentoria-modelos/${slug}.js?v=4`;
    s.onload = () => { window.__mentoriaSlug = slug; res(window.MENTORIA_MODELO || null); };
    s.onerror = () => res(null);
    document.head.appendChild(s);
  });
}

// === BLOCO 4: PERMUTA (Élton, 27/11) ===
// Aluna que paga a mentoria em serviço (ex.: uma massagem por semana). Cada massagem = um pagamento.
// O atraso é automático: semanas desde o início × por semana − feitas. Duas na mesma semana quitam uma atrasada.
// mentoria_leads.permuta (jsonb): { total, unit, servico, inicio: 'AAAA-MM-DD', porSemana, anteriores, itens: [{ d: 'AAAA-MM-DD', t: 'feita' }] }
// SQL: sql/mentoria-permuta.sql
export function resumoPermuta(p, hoje = new Date()) {
  if (!p || !(Number(p.total) > 0) || !(Number(p.unit) > 0)) return null;
  const total = Number(p.total), unit = Number(p.unit), itens = Array.isArray(p.itens) ? p.itens : [];
  const feitas = (Number(p.anteriores) || 0) + itens.filter(i => i.t === 'feita' || i.t === 'repos').length;
  const precisa = Math.ceil(total / unit);
  const pago = Math.min(total, feitas * unit), falta = Math.max(0, total - pago);
  let esperadas = null, atrasadas = 0, adiantadas = 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.inicio || '');
  if (m) {
    const ini = new Date(+m[1], +m[2] - 1, +m[3]), h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const dias = Math.round((h - ini) / 864e5);
    esperadas = dias < 0 ? 0 : Math.min(precisa, (Math.floor(dias / 7) + 1) * (Number(p.porSemana) || 1));
    atrasadas = Math.max(0, esperadas - feitas); adiantadas = Math.max(0, feitas - esperadas);
  }
  return { total, unit, servico: p.servico || 'Massagem', feitas, precisa, pago, falta, esperadas, atrasadas, adiantadas,
    restam: Math.ceil(falta / unit), pct: Math.round(pago / total * 100), quitada: falta <= 0 };
}
