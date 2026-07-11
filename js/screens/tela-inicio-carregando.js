// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Placeholder da tela Home (substituído na Fase 2 pelo CRUD real)
// ─────────────────────────────────────────────────────────────
// Placeholder do Home — será substituído na Fase 2 pelo CRUD real
import { auth, signOut } from '../autenticacao.js';
import { navigate } from '../roteador.js';

export function renderHomePlaceholder(app) {
  app.innerHTML = `
    <div style="padding:40px 16px;text-align:center">
      <div style="font-size:60px;margin-bottom:14px">🏠</div>
      <h1 style="font-size:24px;margin-bottom:8px">Home (Fase 2)</h1>
      <p style="color:var(--muted);font-size:13px;line-height:1.5;max-width:280px;margin:0 auto 24px">
        Você está autenticado!<br><br>
        <strong style="color:var(--accent-2)">${auth.currentUser?.email || 'usuário'}</strong><br><br>
        A Fase 1 (esqueleto + auth) tá funcional.<br>
        A Home/Ritual/Desempenho vêm na próxima fase.
      </p>
      <button class="btn-secondary" id="btn-logout" style="max-width:280px;margin:0 auto;display:block">Sair</button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
    navigate('/login');
  });
}
