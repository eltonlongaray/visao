// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Inicializa o client do Supabase (Auth + Postgres) via CDN ESM.
// Substitui o Firebase. Chave publicável é pública por design — segurança via RLS.
// ─────────────────────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://snbxaudykjpqqgocgaoz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rObp-4IhXg33NkL3P-czVg_aNl9VaxG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession:     true,  // guarda a sessão no localStorage (login persiste)
    autoRefreshToken:   true,  // renova o token sozinho
    detectSessionInUrl: true,  // captura o retorno do OAuth (Google) na URL
  },
});
