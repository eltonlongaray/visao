// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — GERENCIADOR DE TEMA (dia/noite)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: GERENCIADOR DE TEMA (dia/noite)
// Persiste em localStorage (load rápido sem flash) + profile (sync entre devices)
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'visao_theme';

// Retorna 'dark' | 'light' baseado em (1) localStorage, (2) sistema, (3) default
export function getStoredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  // Dark-first: sem escolha salva, abre no ESCURO (não segue o modo claro do
  // sistema). O usuário troca pra claro no toggle se quiser.
  return 'dark';
}

export function applyTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

// Chama ANTES da primeira render pra não ter flash de tema errado
export function initTheme() {
  applyTheme(getStoredTheme());
}
