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
import { auth, db, doc, getDoc, setDoc, collection, getDocs } from './autenticacao.js';


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
  const ref = doc(db, 'users', user.uid, 'consents', key);
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function recordConsent(key, version) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  const ref = doc(db, 'users', user.uid, 'consents', key);
  await setDoc(ref, {
    acceptedAt: new Date().toISOString(),
    version,
    userAgent: (navigator.userAgent || '').substring(0, 200)
  });
}

export async function listAllConsents() {
  const user = auth.currentUser;
  if (!user) return [];
  const col = collection(db, 'users', user.uid, 'consents');
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ key: d.id, ...d.data() }));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: ATALHOS POR TIPO
// ═══════════════════════════════════════════════════════════════
export const hasTerms          = () => hasConsent(`terms_v${TERMS_VERSION}`);
export const recordTerms       = () => recordConsent(`terms_v${TERMS_VERSION}`, TERMS_VERSION);

export const hasPessoalConsent = () => hasConsent(`pessoal_v${PESSOAL_VERSION}`);
export const recordPessoal     = () => recordConsent(`pessoal_v${PESSOAL_VERSION}`, PESSOAL_VERSION);
