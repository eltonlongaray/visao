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
    s.src = `/mentoria-modelos/${slug}.js?v=1`;
    s.onload = () => { window.__mentoriaSlug = slug; res(window.MENTORIA_MODELO || null); };
    s.onerror = () => res(null);
    document.head.appendChild(s);
  });
}
