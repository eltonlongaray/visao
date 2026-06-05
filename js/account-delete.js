// ═══════════════════════════════════════════════════════════════
// VISÃO · Exclusão definitiva de conta (LGPD Art. 18, VI)
// Apaga TODOS os dados do Firestore + auth user.
// Firestore não tem delete recursivo — precisamos iterar.
// ═══════════════════════════════════════════════════════════════
import {
  auth, db, doc, deleteDoc, collection, getDocs
} from './firebase.js';
import * as biometric from './biometric.js';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PUBLIC API
// ═══════════════════════════════════════════════════════════════
// Retorna { firestore: true, auth: 'ok' | 'requires-recent-login' | 'error' }
export async function deleteMyAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const uid = user.uid;

  // 1) Limpa local primeiro pra não deixar bio órfã
  biometric.disable();

  // 2) Apaga todas as subcoleções do user no Firestore
  await wipeUserFirestore(uid);

  // 3) Tenta apagar o auth user
  try {
    await user.delete();
    return { firestore: true, auth: 'ok' };
  } catch (err) {
    if (err?.code === 'auth/requires-recent-login') {
      return { firestore: true, auth: 'requires-recent-login' };
    }
    console.error('[delete] auth.delete falhou:', err);
    return { firestore: true, auth: 'error' };
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: WIPE FIRESTORE — itera e deleta tudo
// ═══════════════════════════════════════════════════════════════
async function wipeUserFirestore(uid) {
  const base = ['users', uid];

  // Subcoleções "flat" (delete docs direto)
  const flatCols = ['shifts', 'categories', 'weeks', 'consents', 'activities'];
  for (const c of flatCols) {
    await deleteCollection([...base, c]);
  }

  // days/{id}/tasks/* → primeiro deleta tasks, depois o day
  const daysSnap = await getDocs(collection(db, ...base, 'days'));
  for (const d of daysSnap.docs) {
    await deleteCollection([...base, 'days', d.id, 'tasks']);
    await deleteDoc(doc(db, ...base, 'days', d.id));
  }

  // Por fim o doc do user
  try { await deleteDoc(doc(db, ...base)); } catch {}
}

async function deleteCollection(pathArr) {
  const snap = await getDocs(collection(db, ...pathArr));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: EXCLUIR MÊS (apenas admin) — pra resetar dados de teste
// ═══════════════════════════════════════════════════════════════
// monthKey: 'YYYY-MM' (ex: '2026-06')
export async function deleteMonth(monthKey) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Formato inválido');

  const base = ['users', user.uid];
  const daysSnap = await getDocs(collection(db, ...base, 'days'));
  const toDelete = daysSnap.docs.filter(d => d.id.startsWith(monthKey + '-'));

  let count = 0;
  for (const d of toDelete) {
    await deleteCollection([...base, 'days', d.id, 'tasks']);
    await deleteDoc(doc(db, ...base, 'days', d.id));
    count++;
  }
  return count;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: EXCLUIR SEMANA (apenas admin)
// ═══════════════════════════════════════════════════════════════
// mondayId: 'YYYY-MM-DD' (segunda-feira da semana)
export async function deleteWeek(mondayId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayId)) throw new Error('Formato inválido');

  const base = ['users', user.uid];
  const monday = new Date(mondayId + 'T00:00:00');

  // Constrói os 7 ids da semana (Seg → Dom)
  const dayIds = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dayIds.push(`${y}-${m}-${dd}`);
  }

  let count = 0;
  for (const dId of dayIds) {
    try {
      await deleteCollection([...base, 'days', dId, 'tasks']);
      await deleteDoc(doc(db, ...base, 'days', dId));
      count++;
    } catch (err) {
      // Ignora se o dia nem existia
    }
  }

  // Remove também a nota semanal (reflexão)
  try { await deleteDoc(doc(db, ...base, 'weeks', mondayId)); } catch {}

  return count;
}
