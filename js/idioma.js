// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — ESTADO
// BLOCO 2 — LOADER — importa o locale sob demanda
// BLOCO 3 — API PÚBLICA
// BLOCO 4 — INICIALIZAÇÃO — carrega o locale salvo
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: ESTADO
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY = 'visao_lang';
const FALLBACK    = 'pt-BR';

let _lang    = localStorage.getItem(STORAGE_KEY) || FALLBACK;
let _strings = {};

const _subscribers = [];


// ═══════════════════════════════════════════════════════════════
// BLOCO 2: LOADER — importa o locale sob demanda
// ═══════════════════════════════════════════════════════════════
const LOCALE_MAP = {
  'pt-BR': () => import('./locales/pt-BR.js'),
  'pt-PT': () => import('./locales/pt-PT.js'),
  'es':    () => import('./locales/es.js'),
  'en':    () => import('./locales/en.js'),
};

export const LANGS = [
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português (BR)' },
  { code: 'pt-PT', flag: '🇵🇹', label: 'Português (PT)' },
  { code: 'es',    flag: '🇪🇸', label: 'Español' },
  { code: 'en',    flag: '🇺🇸', label: 'English' },
];

async function loadLocale(code) {
  const loader = LOCALE_MAP[code] || LOCALE_MAP[FALLBACK];
  try {
    const mod = await loader();
    return mod.default || mod.strings || {};
  } catch {
    if (code !== FALLBACK) return loadLocale(FALLBACK);
    return {};
  }
}


// ═══════════════════════════════════════════════════════════════
// BLOCO 3: API PÚBLICA
// ═══════════════════════════════════════════════════════════════

// Traduz uma chave. Suporta interpolação: t('hello', {name: 'Elton'})
export function t(key, vars) {
  let val = _strings[key];
  if (val === undefined) val = key; // fallback: mostra a própria chave
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
  }
  return val;
}

// Retorna o código do idioma atual
export function getLang() { return _lang; }

// Retorna o flag emoji do idioma atual
export function getLangFlag() {
  return LANGS.find(l => l.code === _lang)?.flag || '🌐';
}

// Muda o idioma, persiste, notifica subscribers
export async function setLang(code) {
  if (!LOCALE_MAP[code]) return;
  _lang = code;
  localStorage.setItem(STORAGE_KEY, code);
  _strings = await loadLocale(code);
  _subscribers.forEach(fn => fn(_lang));
}

// Registra callback chamado ao mudar idioma
export function onLangChange(fn) { _subscribers.push(fn); }


// ═══════════════════════════════════════════════════════════════
// BLOCO 4: INICIALIZAÇÃO — carrega o locale salvo
// ═══════════════════════════════════════════════════════════════
export async function initI18n() {
  _strings = await loadLocale(_lang);
}
