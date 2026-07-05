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
  return Notification.permission; // 'granted' | 'denied' | 'default'
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: AGENDAR — agenda notificação local para um timestamp
// Retorna: 'scheduled' | 'no_trigger' | 'denied' | 'past' | 'unsupported'
// ═══════════════════════════════════════════════════════════════
export async function scheduleNotif({ title, body, tag, timestamp }) {
  if (!notifSupported())          return 'unsupported';
  if (timestamp <= Date.now())    return 'past';

  const perm = await requestPermission();
  if (perm !== 'granted')         return 'denied';

  const reg = await navigator.serviceWorker.ready;

  const options = {
    body,
    icon:             '/icons/icon-192.png',
    badge:            '/icons/favicon-32.png',
    tag,
    vibrate:          [200, 100, 200],
    requireInteraction: true,
    data:             { url: '/' },
  };

  if (triggerSupported()) {
    options.showTrigger = new TimestampTrigger(timestamp);
    await reg.showNotification(title, options);
    return 'scheduled';
  }

  return 'no_trigger';
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CANCELAR — cancela notificação pelo tag
// ═══════════════════════════════════════════════════════════════
export async function cancelNotif(tag) {
  if (!notifSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag, includeTriggered: true });
    list.forEach(n => n.close());
  } catch { /* ignora se SW não suportar */ }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 5: TAG ÚNICA — gera tag reproduzível para um evento
// ═══════════════════════════════════════════════════════════════
export function notifTag(dayDocId, title) {
  return `visao-${dayDocId}-${title.slice(0, 30).replace(/\s+/g, '-')}`;
}
