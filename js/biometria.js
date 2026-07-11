// ═══════════════════════════════════════════════════════════════
// VISÃO · Biometric Auth (WebAuthn)
// Aciona Face ID / Touch ID / digital / PIN do celular pra
// destravar o app. Credencial fica amarrada ao DISPOSITIVO
// (passkey no Secure Enclave / TPM).
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — HELPERS BASE64 ↔ ArrayBuffer
// BLOCO 2 — CAPABILITY / STATE
// BLOCO 3 — REGISTRO DE PASSKEY (1ª vez)
// BLOCO 4 — VERIFICAÇÃO (toda vez que destrava)
// ─────────────────────────────────────────────────────────────
const STORAGE_ENABLED   = 'visao_bio_enabled';
const STORAGE_CREDID    = 'visao_bio_credid';
const STORAGE_DISMISSED = 'visao_bio_dismissed';
const STORAGE_UID       = 'visao_bio_uid';


// ═══════════════════════════════════════════════════════════════
// BLOCO 1: HELPERS BASE64 ↔ ArrayBuffer
// ═══════════════════════════════════════════════════════════════
function randomChallenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function b64ToBuf(b64) {
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr.buffer;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CAPABILITY / STATE
// ═══════════════════════════════════════════════════════════════
// true → device tem Face ID / Touch ID / digital / OU PIN configurado
export async function isAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isEnabled() {
  return localStorage.getItem(STORAGE_ENABLED) === '1' &&
         !!localStorage.getItem(STORAGE_CREDID);
}

export function isEnabledForUser(uid) {
  return isEnabled() && localStorage.getItem(STORAGE_UID) === uid;
}

export function getBoundUid() {
  return localStorage.getItem(STORAGE_UID);
}

export function isDismissed() {
  return localStorage.getItem(STORAGE_DISMISSED) === '1';
}

export function dismissPrompt() {
  localStorage.setItem(STORAGE_DISMISSED, '1');
}

export function disable() {
  localStorage.removeItem(STORAGE_ENABLED);
  localStorage.removeItem(STORAGE_CREDID);
  localStorage.removeItem(STORAGE_DISMISSED);
  localStorage.removeItem(STORAGE_UID);
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: REGISTRO DE PASSKEY (1ª vez)
// ═══════════════════════════════════════════════════════════════
export async function register(userId, userName) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'Falcon' },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7  },  // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60_000,
      attestation: 'none'
    }
  });

  if (!cred) throw new Error('Registro cancelado');

  const credId = bufToB64(cred.rawId);
  localStorage.setItem(STORAGE_CREDID, credId);
  localStorage.setItem(STORAGE_ENABLED, '1');
  localStorage.setItem(STORAGE_UID, userId);
  localStorage.removeItem(STORAGE_DISMISSED);
  return credId;
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: VERIFICAÇÃO (toda vez que destrava)
// ═══════════════════════════════════════════════════════════════
export async function verify() {
  const credId = localStorage.getItem(STORAGE_CREDID);
  if (!credId) throw new Error('Nenhuma credencial cadastrada');

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{
        type: 'public-key',
        id: b64ToBuf(credId),
        transports: ['internal']
      }],
      userVerification: 'required',
      timeout: 60_000
    }
  });

  if (!assertion) throw new Error('Autenticação cancelada');
  return true;
}
