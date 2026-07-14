// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Auth via Supabase com superfície COMPATÍVEL com o antigo
// Firebase (auth.currentUser, onAuthStateChanged, signIn*, signOut...).
// Assim as telas quase não mudam. O CRUD saiu daqui — vive em banco-dados.js.
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';

// ── Mapeia o user do Supabase pro formato que as telas esperam (estilo Firebase) ──
function _mapUser(u) {
  if (!u) return null;
  const m = u.user_metadata || {};
  return {
    uid:         u.id,
    email:       u.email || m.email || null,
    displayName: m.full_name || m.name || null,
    photoURL:    m.avatar_url || m.picture || null,
  };
}

// ── Estado de sessão em memória (currentUser precisa ser síncrono) ──
let _currentUser = null;
let _loaded      = false;
const _listeners = new Set();
function _emit() { for (const cb of _listeners) { try { cb(_currentUser); } catch (e) { console.error('[auth]', e); } } }

export const auth = {
  get currentUser() { return _currentUser; },
};

// Restaura sessão persistida + escuta mudanças (login, logout, refresh, retorno do OAuth)
supabase.auth.getSession().then(({ data }) => {
  _currentUser = _mapUser(data?.session?.user || null);
  _loaded = true;
  _emit();
});
supabase.auth.onAuthStateChange((_event, session) => {
  _currentUser = _mapUser(session?.user || null);
  _loaded = true;
  _emit();
});

// ── onAuthStateChanged(auth, cb) — dispara com o estado atual + a cada mudança ──
export function onAuthStateChanged(_auth, cb) {
  _listeners.add(cb);
  if (_loaded) Promise.resolve().then(() => { try { cb(_currentUser); } catch {} });
  return () => _listeners.delete(cb); // retorna unsubscribe (igual Firebase)
}

// ── Email/senha ──
export async function signInWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw _err(error);
  return { user: _mapUser(data.user) };
}
export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw _err(error);
  return { user: _mapUser(data.user) };
}
export async function signOut(_auth) {
  const { error } = await supabase.auth.signOut();
  if (error) throw _err(error);
}
export async function sendPasswordResetEmail(_auth, email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw _err(error);
}

// ── Google (Supabase usa REDIRECT, não popup — a página sai e volta autenticada) ──
export function GoogleAuthProvider() { /* compat: telas fazem `new GoogleAuthProvider()` */ }
export async function signInWithPopup(_auth, _provider) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw _err(error);
  return new Promise(() => {}); // não resolve: o browser redireciona e volta via detectSessionInUrl
}

// ── Traduz erro do Supabase pro formato que as telas leem (err.message / err.code) ──
function _err(error) {
  const e = new Error(error.message || 'Erro de autenticação');
  e.code = error.code || error.name || '';
  return e;
}
