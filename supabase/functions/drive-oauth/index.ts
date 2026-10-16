// ═══════════════════════════════════════════════════════════════
// FALCON DRIVE — Edge Function (Supabase / Deno), nome: drive-oauth
// Guarda sozinho no Google Drive da pessoa os vídeos das provas dos desafios
// (Élton, 16/10/2026). A pessoa autoriza uma vez ("Conectar meu Google Drive");
// o app cria a pasta "Falcon · Provas dos desafios" e cada vídeo vai pra lá.
// Escopo drive.file: o Falcon só enxerga o que ele mesmo criou no Drive.
//
// Ações (POST com o JWT do Supabase, body.acao):
//   iniciar     → devolve a URL do Google pra pessoa autorizar
//   (GET)       → o Google volta aqui com ?code&state → guarda e cria a pasta
//   status      → { conectado }
//   enviar      → { checkin_id } manda o vídeo dessa prova pro Drive
//   pendentes   → ids das minhas provas com vídeo ainda não guardadas
//   desconectar → revoga a autorização e apaga a conta
//
// Segredos (Edge Functions → Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Criar no painel SEM "Enforce JWT verification" (o Google volta sem JWT; as
// ações conferem o JWT aqui dentro).
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const G_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const G_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

const REDIRECT = 'https://snbxaudykjpqqgocgaoz.supabase.co/functions/v1/drive-oauth';
const APP_URL = 'https://estilo-falcon.web.app';
const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const PASTA = 'Falcon · Provas dos desafios';
const BUCKET = 'desafio-provas';

const sb = createClient(SB_URL, SB_SERVICE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const voltarProApp = (r: string) => Response.redirect(`${APP_URL}/?drive=${r}`, 302);

// ── Quem chamou (JWT do Supabase) ───────────────────────────────
async function uidDoReq(req: Request): Promise<string | null> {
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const sbA = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data } = await sbA.auth.getUser();
    return data?.user?.id || null;
  } catch { return null; }
}

// ── Google: token ───────────────────────────────────────────────
async function tokenGoogle(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, ...params }),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

// Token de acesso da pessoa (renova pelo refresh_token a cada uso).
// Autorização revogada no Google → apaga a conta (volta o aviso no app).
async function acessoDe(uid: string): Promise<{ token: string; pasta: string | null } | null> {
  const { data: conta } = await sb.from('drive_contas').select('refresh_token, pasta_id').eq('user_id', uid).maybeSingle();
  if (!conta?.refresh_token) return null;
  const { ok, data } = await tokenGoogle({ grant_type: 'refresh_token', refresh_token: conta.refresh_token });
  if (!ok || !data.access_token) {
    if (data?.error === 'invalid_grant') await sb.from('drive_contas').delete().eq('user_id', uid);
    return null;
  }
  return { token: data.access_token, pasta: conta.pasta_id };
}

async function drive(token: string, path: string, opts: RequestInit = {}) {
  return fetch(`https://www.googleapis.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

async function criarPasta(token: string): Promise<string | null> {
  const r = await drive(token, '/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PASTA, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const j = await r.json().catch(() => ({}));
  return j.id || null;
}

// A pasta pode ter sido apagada pela pessoa: confere e recria se precisar
async function pastaViva(uid: string, token: string, pasta: string | null): Promise<string | null> {
  if (pasta) {
    const r = await drive(token, `/drive/v3/files/${encodeURIComponent(pasta)}?fields=id,trashed`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && !j.trashed) return pasta;
  }
  const nova = await criarPasta(token);
  if (nova) await sb.from('drive_contas').update({ pasta_id: nova }).eq('user_id', uid);
  return nova;
}

// ── Partes do vídeo (igual a partesDoVideo em js/desafios.js) ────
function partesDoVideo(caminho: string): string[] {
  const n = Number((/-n(\d+)\.[a-z0-9]+$/i.exec(caminho || '') || [])[1] || 1);
  return n > 1 ? [caminho, ...Array.from({ length: n - 1 }, (_, i) => `${caminho}.p${i + 2}`)] : [caminho];
}

// ── Envia o vídeo de uma prova (upload retomável, parte por parte) ──
async function enviarProva(uid: string, checkinId: string) {
  const { data: ck } = await sb.from('desafio_checkins')
    .select('id, user_id, dia, video_path, video_expira_em, drive_file_id, desafio_id')
    .eq('id', checkinId).eq('user_id', uid).maybeSingle();
  if (!ck?.video_path) return { ok: false, motivo: 'sem_video' };
  if (ck.drive_file_id) return { ok: true, ja: true };
  if (ck.video_expira_em && new Date(ck.video_expira_em).getTime() < Date.now()) return { ok: false, motivo: 'video_saiu' };

  const acesso = await acessoDe(uid);
  if (!acesso) return { ok: false, motivo: 'sem_conta' };
  const pasta = await pastaViva(uid, acesso.token, acesso.pasta);
  if (!pasta) return { ok: false, motivo: 'sem_pasta' };

  const { data: d } = await sb.from('desafios').select('titulo').eq('id', ck.desafio_id).maybeSingle();
  const ext = (/\.([a-z0-9]+)$/i.exec(ck.video_path) || [])[1] || 'webm';
  const mime = ext === 'mp4' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : 'video/webm';
  const titulo = String(d?.titulo || 'Desafio').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim();
  const nome = `${ck.dia || 'prova'} · ${titulo}.${ext}`;

  const ini = await drive(acesso.token, '/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
    body: JSON.stringify({ name: nome, parents: [pasta] }),
  });
  const sessao = ini.headers.get('Location');
  if (!ini.ok || !sessao) return { ok: false, motivo: 'drive_recusou' };

  // Cada parte tem 45 MB (múltiplo de 256 KB, como o Google exige); a última fecha o total
  const partes = partesDoVideo(ck.video_path);
  let pos = 0;
  let fileId: string | null = null;
  for (let i = 0; i < partes.length; i++) {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(partes[i]);
    if (error || !blob) return { ok: false, motivo: 'sem_arquivo' };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ultima = i === partes.length - 1;
    const fim = pos + bytes.length - 1;
    const r = await fetch(sessao, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${pos}-${fim}/${ultima ? fim + 1 : '*'}` },
      body: bytes,
    });
    if (ultima) {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) return { ok: false, motivo: 'drive_falhou' };
      fileId = j.id;
    } else if (r.status !== 308) {
      return { ok: false, motivo: 'drive_falhou' };
    }
    pos = fim + 1;
  }
  await sb.from('desafio_checkins').update({ drive_file_id: fileId }).eq('id', ck.id);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  // Volta do Google
  if (req.method === 'GET' && (url.searchParams.get('code') || url.searchParams.get('error'))) {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    if (!state) return voltarProApp('erro');
    const { data: st } = await sb.from('drive_oauth_state').select('user_id, created_at').eq('state', state).maybeSingle();
    await sb.from('drive_oauth_state').delete().eq('state', state);
    if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return voltarProApp('erro');
    if (!code) return voltarProApp('cancelou');
    const { ok, data } = await tokenGoogle({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
    if (!ok || !data.refresh_token || !data.access_token) return voltarProApp('erro');
    if (!String(data.scope || '').includes(ESCOPO)) return voltarProApp('sem_permissao');
    const pasta = await criarPasta(data.access_token);
    await sb.from('drive_contas').upsert({
      user_id: st.user_id, refresh_token: data.refresh_token, pasta_id: pasta, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    return voltarProApp('ok');
  }

  if (req.method !== 'POST') return json({ ok: false, erro: 'método' }, 405);
  if (!G_ID || !G_SECRET) return json({ ok: false, erro: 'Google não configurado' }, 500);
  const uid = await uidDoReq(req);
  if (!uid) return json({ ok: false, erro: 'Entre no app de novo' }, 401);
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.acao) {
      case 'iniciar': {
        const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
        await sb.from('drive_oauth_state').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());
        const { error } = await sb.from('drive_oauth_state').insert({ state, user_id: uid });
        if (error) return json({ ok: false, erro: 'Não deu pra começar' }, 500);
        const q = new URLSearchParams({
          client_id: G_ID, redirect_uri: REDIRECT, response_type: 'code', scope: ESCOPO,
          access_type: 'offline', prompt: 'consent', state,
        });
        return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
      }
      case 'status': {
        const { data } = await sb.from('drive_contas').select('user_id').eq('user_id', uid).maybeSingle();
        return json({ ok: true, conectado: !!data });
      }
      case 'enviar': {
        if (!body.checkin_id) return json({ ok: false, erro: 'checkin_id' }, 400);
        return json(await enviarProva(uid, String(body.checkin_id)));
      }
      case 'pendentes': {
        const { data } = await sb.from('desafio_checkins').select('id')
          .eq('user_id', uid).not('video_path', 'is', null).is('drive_file_id', null)
          .gt('video_expira_em', new Date().toISOString()).order('created_at').limit(10);
        return json({ ok: true, ids: (data || []).map((c: { id: string }) => c.id) });
      }
      case 'desconectar': {
        const { data } = await sb.from('drive_contas').select('refresh_token').eq('user_id', uid).maybeSingle();
        if (data?.refresh_token) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => {});
        }
        await sb.from('drive_contas').delete().eq('user_id', uid);
        return json({ ok: true });
      }
      default:
        return json({ ok: false, erro: 'ação desconhecida' }, 400);
    }
  } catch (e) {
    console.error('[drive-oauth]', (e as Error)?.message || e);
    return json({ ok: false, erro: 'falhou' }, 500);
  }
});
