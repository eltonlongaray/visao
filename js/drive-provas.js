// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Provas guardadas sozinhas no Google Drive
// A pessoa conecta o Drive uma vez; o servidor (Edge Function drive-oauth)
// cria a pasta "Falcon · Provas dos desafios" e manda cada vídeo pra lá logo
// depois do envio. Ao abrir o app, manda o que ficou pra trás (Élton, 16/10).
// BLOCO 1 — CHAMAR O SERVIDOR
// BLOCO 2 — CONECTAR / DESCONECTAR / STATUS
// BLOCO 3 — MANDAR OS VÍDEOS
// BLOCO 4 — AO ENTRAR NO APP (volta do Google)
// ─────────────────────────────────────────────────────────────
import { showToast } from './aviso-tela.js';

const FN_URL = 'https://snbxaudykjpqqgocgaoz.supabase.co/functions/v1/drive-oauth';
const CHAVE = 'falcon_drive_on';   // lembrança no aparelho: '1' conectado, '0' não

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CHAMAR O SERVIDOR
// ═══════════════════════════════════════════════════════════════
async function _fn(corpo) {
  const { supabase } = await import('./config-supabase.js');
  const token = (await supabase.auth.getSession())?.data?.session?.access_token;
  if (!token) throw new Error('sem sessão');
  const r = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !('ok' in j)) throw new Error(j.erro || `drive ${r.status}`);
  return j;
}
const _lembrar = (on) => { try { localStorage.setItem(CHAVE, on ? '1' : '0'); } catch { /* sem storage */ } };
const _lembrado = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CONECTAR / DESCONECTAR / STATUS
// ═══════════════════════════════════════════════════════════════
// Vai pra tela do Google ("Permitir"); o Google volta pro app com ?drive=ok
export async function conectarDrive() {
  try {
    const j = await _fn({ acao: 'iniciar' });
    if (!j.url) throw new Error(j.erro || 'sem url');
    showToast('Abrindo o Google…', 'info');
    location.href = j.url;
    return true;
  } catch {
    showToast('Não deu pra conectar o Drive agora. Tenta de novo daqui a pouco.', 'error');
    return false;
  }
}

let _statusCache = null;
export async function driveConectado({ fresco = false } = {}) {
  if (!fresco && _statusCache !== null) return _statusCache;
  try {
    const j = await _fn({ acao: 'status' });
    _statusCache = !!j.conectado;
    _lembrar(_statusCache);
  } catch {
    _statusCache = _lembrado() === '1';
  }
  return _statusCache;
}
// Sem esperar o servidor (pra decidir se mostra o aviso na hora)
export const driveLembradoConectado = () => _statusCache ?? (_lembrado() === '1');

export async function desconectarDrive() {
  try {
    await _fn({ acao: 'desconectar' });
    _statusCache = false; _lembrar(false);
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: MANDAR OS VÍDEOS
// ═══════════════════════════════════════════════════════════════
// Depois de enviar a prova: segundo plano, sem travar nada
export async function enviarProvaDrive(checkinId) {
  if (!checkinId || !driveLembradoConectado()) return false;
  try {
    const j = await _fn({ acao: 'enviar', checkin_id: checkinId });
    if (j.motivo === 'sem_conta') { _statusCache = false; _lembrar(false); }
    return !!j.ok;
  } catch { return false; }
}

// O que ficou pra trás (sem internet na hora, app fechado no meio)
let _sincronizando = false;
export async function sincronizarDrive() {
  if (_sincronizando || !(await driveConectado())) return 0;
  _sincronizando = true;
  let n = 0;
  try {
    const { ids = [] } = await _fn({ acao: 'pendentes' });
    for (const id of ids) if (await enviarProvaDrive(id)) n++;
  } catch { /* tenta na próxima vez */ }
  finally { _sincronizando = false; }
  return n;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: AO ENTRAR NO APP (volta do Google)
// ═══════════════════════════════════════════════════════════════
export async function aoEntrar() {
  const p = new URLSearchParams(location.search);
  const r = p.get('drive');
  if (r) {
    p.delete('drive');
    const q = p.toString();
    history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    // Resposta perdida no caminho: confere no servidor se conectou mesmo
    const conectou = r === 'ok' || ((r === 'verificar' || r === 'erro') && await driveConectado({ fresco: true }));
    if (conectou) {
      _statusCache = true; _lembrar(true);
      showToast('✅ Drive conectado! Teus vídeos das provas vão sozinhos pra pasta "Falcon · Provas dos desafios".', 'success');
    } else if (r === 'cancelou') {
      showToast('Drive não conectado. Se mudar de ideia, toca em ☁️ Drive no grupo do desafio.', 'info');
    } else {
      showToast('Não deu pra conectar o Drive. Tenta de novo e marca a permissão de guardar arquivos.', 'error');
    }
  }
  const n = await sincronizarDrive();
  if (n && r) showToast(`☁️ ${n} vídeo${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''} no teu Drive.`, 'success');
}
