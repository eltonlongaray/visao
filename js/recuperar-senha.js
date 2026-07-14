// ═══════════════════════════════════════════════════════════════
// FALCON · Definir nova senha (fluxo de recuperação do Supabase)
// O link do email volta pro app com um token de recovery. O Supabase
// dispara PASSWORD_RECOVERY e aqui abrimos o modal pra definir a senha.
// ═══════════════════════════════════════════════════════════════
import { updatePassword } from './autenticacao.js';
import { showToast } from './aviso-tela.js';

let _open = false;

export function showSetPasswordModal() {
  if (_open) return;
  _open = true;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div style="font-size:38px;text-align:center;margin-bottom:4px">🔑</div>
      <div class="modal-title" style="text-align:center">Defina sua nova senha</div>
      <div class="modal-hint" style="margin-bottom:14px">
        O Falcon mudou de servidor e sua senha precisa ser criada de novo.
        Seus dados estão todos aqui — é só definir a senha e entrar.
      </div>

      <label class="input-field">
        <div class="input-field-label">Nova senha (mínimo 6 caracteres)</div>
        <input type="password" id="np1" placeholder="••••••••" autocomplete="new-password" />
      </label>
      <label class="input-field">
        <div class="input-field-label">Confirmar senha</div>
        <input type="password" id="np2" placeholder="••••••••" autocomplete="new-password" />
      </label>

      <div class="modal-hint" id="npErr" style="color:var(--red);min-height:18px;font-size:12px"></div>

      <div class="modal-actions">
        <button class="btn-primary" id="npSave" style="width:100%">Salvar senha e entrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const p1  = overlay.querySelector('#np1');
  const p2  = overlay.querySelector('#np2');
  const err = overlay.querySelector('#npErr');
  const btn = overlay.querySelector('#npSave');

  btn.addEventListener('click', async () => {
    err.textContent = '';
    const a = p1.value, b = p2.value;
    if (a.length < 6)  { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
    if (a !== b)       { err.textContent = 'As senhas não coincidem.'; return; }

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      await updatePassword(a);
      overlay.remove();
      _open = false;
      showToast('✅ Senha definida! Bem-vindo de volta.', 'success', 5000);
    } catch (e) {
      err.textContent = e.message || 'Não deu pra salvar. Tente de novo.';
      btn.disabled = false;
      btn.textContent = 'Salvar senha e entrar';
    }
  });

  setTimeout(() => p1.focus(), 80);
}
