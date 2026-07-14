// ═══════════════════════════════════════════════════════════════
// VISÃO · Gerenciador de consentimentos (LGPD)
// Cada usuário tem documentos em users/{uid}/consents/{key}
// Persistir aceite com timestamp + versão pra prova jurídica.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — VERSÕES (incrementar quando mudar o texto legal)
// BLOCO 2 — API GENÉRICA
// BLOCO 3 — ATALHOS POR TIPO
// ─────────────────────────────────────────────────────────────
import { auth } from './autenticacao.js';
import { supabase } from './config-supabase.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: VERSÕES (incrementar quando mudar o texto legal)
// ═══════════════════════════════════════════════════════════════
export const TERMS_VERSION    = 1;  // Termos de Uso + Política de Privacidade
export const PESSOAL_VERSION  = 1;  // Consentimento de dados de saúde (Pessoal)


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: API GENÉRICA
// ═══════════════════════════════════════════════════════════════
export async function hasConsent(key) {
  const user = auth.currentUser;
  if (!user) return false;
  const { data, error } = await supabase.from('consents').select('key').eq('key', key).maybeSingle();
  if (error) return false;
  return !!data;
}

export async function recordConsent(key, version) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  const { error } = await supabase.from('consents').upsert({
    user_id:     user.uid,
    key,
    accepted_at: new Date().toISOString(),
    version,
    user_agent:  (navigator.userAgent || '').substring(0, 200),
  }, { onConflict: 'user_id,key' });
  if (error) throw new Error(error.message);
}

export async function listAllConsents() {
  const user = auth.currentUser;
  if (!user) return [];
  const { data, error } = await supabase.from('consents').select('*');
  if (error) return [];
  return (data || []).map(d => ({ key: d.key, acceptedAt: d.accepted_at, version: d.version, userAgent: d.user_agent }));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ATALHOS POR TIPO
// ═══════════════════════════════════════════════════════════════
export const hasTerms          = () => hasConsent(`terms_v${TERMS_VERSION}`);
export const recordTerms       = () => recordConsent(`terms_v${TERMS_VERSION}`, TERMS_VERSION);

export const hasPessoalConsent = () => hasConsent(`pessoal_v${PESSOAL_VERSION}`);
export const recordPessoal     = () => recordConsent(`pessoal_v${PESSOAL_VERSION}`, PESSOAL_VERSION);
