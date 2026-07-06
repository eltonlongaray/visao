// ═══════════════════════════════════════════════════════════════
// BLOCO 1: SUPORTE — verifica se o browser suporta notificações
// ═══════════════════════════════════════════════════════════════
export function notifSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function triggerSupported() {
  try { return typeof TimestampTrigger !== 'undefined'; }
  catch { return false; }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERMISSÃO
// ═══════════════════════════════════════════════════════════════
export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  const result = await Notification.requestPermission();
  return result; // 'granted' | 'denied' | 'default'
}

export function permissionStatus() {
  if (!notifSupported()) return 'unsupported';
  return Notification.permission;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: PERSISTÊNCIA — localStorage para o checador do main thread
// ═══════════════════════════════════════════════════════════════
const SCHED_KEY = 'visao_notif_schedule';

function saveToSchedule({ title, body, tag, icon, badge, timestamp }) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  const filtered = list.filter(n => n.tag !== tag); // substitui se já existe com mesmo tag
  filtered.push({ title, body, tag, icon, badge, timestamp });
  localStorage.setItem(SCHED_KEY, JSON.stringify(filtered));
}

export function cancelFromSchedule(tag) {
  const list = JSON.parse(localStorage.getItem(SCHED_KEY) || '[]');
  localStorage.setItem(SCHED_KEY, JSON.stringify(list.filter(n => n.tag !== tag)));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: AGENDAR
// Camada 1 — TimestampTrigger (Chrome experimental): funciona com app fechado
// Camada 2 — SW postMessage + setTimeout: funciona enquanto SW está vivo (~5 min)
// Camada 3 — localStorage + setInterval no main thread: funciona enquanto app aberto
// Retorna: 'scheduled' | 'denied' | 'past' | 'unsupported'
// ═══════════════════════════════════════════════════════════════
export async function scheduleNotif({ title, body, tag, timestamp }) {
  if (!notifSupported())       return 'unsupported';
  if (timestamp <= Date.now()) return 'past';

  const perm = await requestPermission();
  if (perm !== 'granted')      return 'denied';

  const reg = await navigator.serviceWorker.ready;
  const options = {
    body,
    icon:               '/icons/icon-192.png',
    badge:              '/icons/favicon-32.png',
    tag,
    vibrate:            [200, 100, 200],
    requireInteraction: true,
    data:               { url: '/' },
  };

  // Camada 1: TimestampTrigger (melhor opção — funciona com app fechado)
  if (triggerSupported()) {
    options.showTrigger = new TimestampTrigger(timestamp);
    await reg.showNotification(title, options);
    return 'scheduled';
  }

  const delayMs = timestamp - Date.now();

  // Camada 2: SW setTimeout (funciona enquanto SW está vivo)
  if (reg.active) {
    reg.active.postMessage({
      type: 'SCHEDULE_NOTIF',
      title, body, tag,
      icon: options.icon,
      badge: options.badge,
      delayMs,
    });
  }

  // Camada 3: localStorage (dispara quando o app estiver aberto no horário)
  saveToSchedule({ title, body, tag, icon: options.icon, badge: options.badge, timestamp });

  return 'scheduled';
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: CHECKER — roda no main thread, verifica notificações vencidas
// Chame uma vez no startup (main.js). Intervalo: 30s.
// ═══════════════════════════════════════════════════════════════
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
          body: n.body, icon: n.icon, badge: n.badge, tag: n.tag,
          vibrate: [200, 100, 200], requireInteraction: true, data: { url: '/' },
        });
      }
    } catch (err) {
      console.warn('[notif-checker]', err);
    }
  };

  await check(); // checa imediatamente ao abrir
  setInterval(check, 30_000);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 6: CANCELAR — cancela notificação pelo tag
// ═══════════════════════════════════════════════════════════════
export async function cancelNotif(tag) {
  cancelFromSchedule(tag);
  if (!notifSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag, includeTriggered: true });
    list.forEach(n => n.close());
  } catch { /* ignora se SW não suportar */ }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 7: TAG ÚNICA — gera tag reproduzível para um evento
// ═══════════════════════════════════════════════════════════════
export function notifTag(dayDocId, title) {
  return `visao-${dayDocId}-${title.slice(0, 30).replace(/\s+/g, '-')}`;
}
