// ─── ÍNDICE ──────────────────────────────────────────────────
// Entrada da página LEVE da rifa (rifa.html). Só supabase + render público.
// Splash "Falcon Rifa" ~2,5s e revela a grade de números.
// ─────────────────────────────────────────────────────────────
import { renderRifaPublica } from './rifa-publica.js';

const MIN_SPLASH = 2500;
const t0 = Date.now();
const slug = location.pathname.replace(/^\/rifa\//, '').replace(/\/+$/, '').trim();
const app = document.getElementById('rf-app');
const splash = document.getElementById('rf-splash');

function esconderSplash() {
  const espera = Math.max(0, MIN_SPLASH - (Date.now() - t0));
  setTimeout(() => {
    if (!splash) return;
    splash.classList.add('rf-splash-hide');
    setTimeout(() => splash.remove(), 450);
  }, espera);
}

renderRifaPublica(app, slug).catch(() => {}).finally(esconderSplash);
