// ═══════════════════════════════════════════════════════════════
// VISÃO · Notifications
// Entrega notificações via Cloudflare Worker (Web Push + VAPID).
// Fallback: localStorage + setInterval quando app está aberto.
// ═══════════════════════════════════════════════════════════════

// ── Config ───────────────────────────────────────────────────
// Preenchidos após deploy do Worker (ver instruções em visao-push-worker/)
const WORKER_URL    = 'https://visao-push-worker.REPLACE_SEU_USUARIO.workers.dev';
const WORKER_API_KEY = 'REPLACE_API_KEY';
const VAPID_PUBLIC_KEY = 'BKbrmYvllDJCioKNwG0m_v52AqCcPBI2khD_FsYYkzZSbhY9QNp3E5CvfoKYGmdUJ7H4ySI-YyO7Hbxoum089ZY';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SUPORTE
// ═══════════════════════════════════════════════════════════════
export function notifSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function permissionStatus() {
  if (!notifSupported()) return 'unsupported';
  return Notification.permission;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERMISSÃO + ASSINATURA WEB PUSH
// ═══════════════════════════════════════════════════════════════
export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return Notification.requestPermission();
}

// Converte VAPID public key de base64url para Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Retorna o userId atual (Firebase Auth)
function getUserId() {
  try {
    const { auth } = globalThis._visaoAuth || {};
    return auth?.currentUser?.uid || null;
  } catch { return null; }
}

// Assina no PushManager e registra o subscription no Worker
export async function subscribeToPush() {
  if (!notifSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (WORKER_URL.includes('REPLACE')) return; // Worker ainda não configurado

  const userId = getUserId();
  if (!userId) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    // Envia assinatura ao Worker
    await fetch(`${WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });
  } catch (err) {
    console.warn('[notif] subscribeToPush:', err.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AGENDAR VIA WORKER
// ═══════════════════════════════════════════════════════════════
export async function scheduleNotif({ title, body, tag, timestamp }) {
  if (!notifSupported())       return 'unsupported';
  if (timestamp <= Date.now()) return 'past';

  const perm = await requestPermission();
  if (perm !== 'granted')      return 'denied';

  const userId = getUserId();

  // ── Via Worker (notificação mesmo com app fechado) ───────────
  if (userId && !WORKER_URL.includes('REPLACE')) {
    try {
      await subscribeToPush(); // garante que a subscription existe
      await fetch(`${WORKER_URL}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
        body: JSON.stringify({ userId, title, body, tag, timestamp }),
      });
      // Também salva localmente como fallback se app estiver aberto
      _saveLocal({ title, body, tag, timestamp });
      return 'scheduled';
    } catch (err) {
      console.warn('[notif] worker schedule falhou, usando fallback local:', err.message);
    }
  }

  // ── Fallback: notificação só enquanto app estiver aberto ─────
  _saveLocal({ title, body, tag, timestamp });
  return 'scheduled';
}

// ─── Cancelar ─────────────────────────────────────────────────
export async function cancelNotif(tag) {
  _removeLocal(tag);
  const userId = getUserId();
  if (userId && !WORKER_URL.includes('REPLACE')) {
    fetch(`${WORKER_URL}/schedule`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': WORKER_API_KEY },
      body: JSON.stringify({ tag }),
    }).catch(() => {});
  }
  // Cancela do SW (se TimestampTrigger ou pushManager)
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag, includeTriggered: true });
    list.forEach(n => n.close());
  } catch {}
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: FALLBACK LOCAL (app aberto)
// ═══════════════════════════════════════════════════════════════
const SCHED_KEY = 'visao_notif_schedule';

function _saveLocal(entry) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  const filtered = list.filter(n => n.tag !== entry.tag);
  filtered.push(entry);
  localStorage.setItem(SCHED_KEY, JSON.stringify(filtered));
}

function _removeLocal(tag) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  localStorage.setItem(SCHED_KEY, JSON.stringify(list.filter(n => n.tag !== tag)));
}

export async function startNotifChecker() {
  if (!notifSupported() || Notification.permission !== 'granted') return;

  const check = async () => {
    const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
    if (!list.length) return;
    const now = Date.now();
    const due = list.filter(n => n.timestamp <= now);
    if (!due.length) return;
    localStorage.setItem(SCHED_KEY, JSON.stringify(list.filter(n => n.timestamp > now)));
    try {
      const reg = await navigator.serviceWorker.ready;
      for (const n of due) {
        await reg.showNotification(n.title, {
          body: n.body, icon: '/icons/icon-192.png',
          badge: '/icons/favicon-32.png', tag: n.tag,
          vibrate: [200, 100, 200], requireInteraction: true, data: { url: '/' },
        });
      }
    } catch (err) { console.warn('[notif-checker]', err); }
  };

  await check();
  setInterval(check, 30_000);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: TAG ÚNICA
// ═══════════════════════════════════════════════════════════════
export function notifTag(dayDocId, title) {
  return `visao-${dayDocId}-${title.slice(0, 30).replace(/\s+/g, '-')}`;
}
