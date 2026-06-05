// ═══════════════════════════════════════════════════════════════
// VISÃO · Admin check (escopo simples por e-mail)
// Quando virar produto público, trocar por role/claim no Firebase Auth.
// ═══════════════════════════════════════════════════════════════
import { auth } from './firebase.js';

const ADMIN_EMAILS = [
  'elton.longaray483@gmail.com'
];

export function isAdmin() {
  const email = (auth.currentUser?.email || '').toLowerCase();
  return ADMIN_EMAILS.includes(email);
}
