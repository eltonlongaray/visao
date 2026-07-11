// ═══════════════════════════════════════════════════════════════
// VISÃO · Admin check (escopo simples por e-mail)
// Quando virar produto público, trocar por role/claim no Firebase Auth.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Verifica se o usuário atual é admin por lista de e-mails
// ─────────────────────────────────────────────────────────────
import { auth } from './autenticacao.js';

const ADMIN_EMAILS = [
  'elton.longaray483@gmail.com'
];

export function isAdmin() {
  const email = (auth.currentUser?.email || '').toLowerCase();
  return ADMIN_EMAILS.includes(email);
}
