// ─── ÍNDICE ──────────────────────────────────────────────────
// Entrada da página LEVE de agendamento (agenda.html). Não carrega o app:
// só supabase + o render público. Mostra o splash (olho do Falcon + "Falcon
// Agenda") por ~2,5s e então revela a agenda já carregada por trás.
// ─────────────────────────────────────────────────────────────
import { renderAgendaPublica } from './agenda-publica.js';

const MIN_SPLASH = 2500;
const t0 = Date.now();
const slug = location.pathname.replace(/^\/agenda-online\//, '').replace(/\/+$/, '').trim();
const app = document.getElementById('ag-app');
const splash = document.getElementById('ag-splash');

function esconderSplash() {
  const espera = Math.max(0, MIN_SPLASH - (Date.now() - t0));
  setTimeout(() => {
    if (!splash) return;
    splash.classList.add('ag-splash-hide');
    setTimeout(() => splash.remove(), 450);
  }, espera);
}

// renderiza por trás do splash; quando terminar (e passar o tempo mínimo), revela
renderAgendaPublica(app, slug).catch(() => {}).finally(esconderSplash);
