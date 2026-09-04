// ═══════════════════════════════════════════════════════════════
// FALCON RIFA — Edge Function (Supabase / Deno)
// Backend seguro do Pix via Mercado Pago.
//
// Dois modos de recebimento por rifa (rifas.pix_modo):
//   'mp'         → Pix na conta do ELTON (token de ambiente MP_ACCESS_TOKEN) — rifa do Pitter
//   'mp_connect' → Pix na conta do PRÓPRIO CRIADOR (token OAuth guardado em mp_contas)
//   'estatico'   → não passa por aqui (Pix estático na chave do criador, feito no app)
//
// Ações (?action= ou body.action):
//   oauth_start → devolve a URL do Mercado Pago pra o criador autorizar
//   (redirect)  → o MP volta aqui com ?code&state → troca por token e guarda
//   criar       → reserva os números + cria o Pix (na conta certa) → QR + copia-e-cola
//   status      → consulta o pagamento → 'approved'/'pending'/...
//   webhook     → o MP avisa; se aprovado, marca os números como pagos
//
// Segredos (Edge Functions → Secrets):
//   MP_ACCESS_TOKEN  (token de produção do Elton — rifa do Pitter)
//   MP_CLIENT_ID     (Client ID do app "Falcon Rifa")
//   MP_CLIENT_SECRET (Client Secret do app "Falcon Rifa")
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || '';
const MP_CLIENT_ID = Deno.env.get('MP_CLIENT_ID') || '';
const MP_CLIENT_SECRET = Deno.env.get('MP_CLIENT_SECRET') || '';
const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

const REDIRECT = 'https://snbxaudykjpqqgocgaoz.supabase.co/functions/v1/quick-service';
const APP_URL = 'https://estilo-falcon.web.app';

const sb = createClient(SB_URL, SB_SERVICE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function mp(path: string, opts: RequestInit = {}, token = MP_TOKEN) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

// ── OAuth: quem é o usuário logado que chamou (via JWT do Supabase) ──
async function uidDoReq(req: Request): Promise<string | null> {
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const sbA = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data } = await sbA.auth.getUser();
    return data?.user?.id || null;
  } catch { return null; }
}

// Token do CRIADOR (renova pelo refresh_token se estiver perto de vencer).
async function tokenDoCriador(ownerId: string): Promise<string | null> {
  if (!ownerId) return null;
  const { data } = await sb.from('mp_contas').select('*').eq('user_id', ownerId).maybeSingle();
  if (!data) return null;
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (exp && exp - Date.now() < 3600_000 && data.refresh_token) {
    const r = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: MP_CLIENT_ID, client_secret: MP_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.access_token) {
      const expires_at = new Date(Date.now() + (Number(j.expires_in) || 15552000) * 1000).toISOString();
      await sb.from('mp_contas').update({ access_token: j.access_token, refresh_token: j.refresh_token || data.refresh_token, expires_at, updated_at: new Date().toISOString() }).eq('user_id', ownerId);
      return j.access_token;
    }
  }
  return data.access_token;
}

// Token a usar pra uma rifa (conta do criador ou do Elton).
async function tokenDaRifa(rifa: any): Promise<string | null> {
  if (rifa?.pix_modo === 'mp_connect') return await tokenDoCriador(rifa.owner_id);
  return MP_TOKEN;   // 'mp' (Pitter) e fallback
}
// Token a partir de um payment_id (pra status/webhook).
async function tokenPorPagamento(paymentId: string): Promise<string> {
  const { data: pg } = await sb.from('rifa_pagamentos').select('rifa_id').eq('payment_id', String(paymentId)).maybeSingle();
  if (!pg) return MP_TOKEN;
  const { data: rifa } = await sb.from('rifas').select('owner_id, pix_modo').eq('id', pg.rifa_id).maybeSingle();
  return (await tokenDaRifa(rifa)) || MP_TOKEN;
}

// ── OAUTH START: URL pro criador autorizar o Mercado Pago dele ───
async function oauthStart(req: Request) {
  const uid = await uidDoReq(req);
  if (!uid) return json({ error: 'Faça login primeiro' }, 401);
  if (!MP_CLIENT_ID) return json({ error: 'MP_CLIENT_ID não configurado' }, 500);
  const state = crypto.randomUUID();
  await sb.from('mp_oauth_state').insert({ state, user_id: uid });
  const url = `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(MP_CLIENT_ID)}`
    + `&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(REDIRECT)}`;
  return json({ url });
}

// ── OAUTH CALLBACK: o MP volta com ?code&state → troca por token ──
async function oauthCallback(code: string, state: string) {
  const redir = (msg: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}/?mp=${msg}` } });
  const { data: st } = await sb.from('mp_oauth_state').select('user_id').eq('state', state).maybeSingle();
  if (!st) return redir('erro');
  const r = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: MP_CLIENT_ID, client_secret: MP_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) return redir('erro');
  const expires_at = new Date(Date.now() + (Number(j.expires_in) || 15552000) * 1000).toISOString();
  await sb.from('mp_contas').upsert({
    user_id: st.user_id, mp_user_id: String(j.user_id || ''), access_token: j.access_token,
    refresh_token: j.refresh_token || null, expires_at, updated_at: new Date().toISOString(),
  });
  await sb.from('mp_oauth_state').delete().eq('state', state);
  return redir('ok');
}

// ── CRIAR: reserva os números + cria o Pix na conta certa ───────
async function criar(body: any) {
  const { slug, numeros, nome, contato, valor } = body;
  if (!slug || !Array.isArray(numeros) || !numeros.length) return json({ error: 'Dados incompletos' }, 400);
  if (!nome || String(nome).trim().length < 2) return json({ error: 'Informe seu nome' }, 400);
  const valorNum = Number(valor);
  if (!(valorNum > 0)) return json({ error: 'Valor inválido' }, 400);

  const { data: rifa } = await sb.from('rifas').select('id, titulo, ativo, owner_id, pix_modo').eq('slug', slug).maybeSingle();
  if (!rifa || !rifa.ativo) return json({ error: 'Rifa indisponível' }, 400);

  const token = await tokenDaRifa(rifa);
  if (!token) return json({ error: 'O criador ainda não conectou o Mercado Pago.' }, 400);

  // reserva os números (pago=false) — falha tudo se algum já existir
  const linhas = numeros.map((n: number) => ({
    rifa_id: rifa.id, numero: n, nome: String(nome).trim(),
    contato: String(contato || '').trim() || null, pago: false,
  }));
  const ins = await sb.from('rifa_numeros').insert(linhas).select('id');
  if (ins.error) {
    const dup = /duplicate|unique|23505/i.test(ins.error.message || '');
    return json({ error: dup ? 'Algum número já foi escolhido. Recarregue e tente de novo.' : ins.error.message }, 409);
  }

  const descricao = `Rifa: ${rifa.titulo || 'Falcon Rifa'} — nº ${numeros.join(', ')}`;
  const email = `rifa_${String(contato || '').replace(/\D/g, '') || Date.now()}@estilo-falcon.web.app`;
  const { ok, data: pay } = await mp('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': `rifa-${rifa.id}-${numeros.join('-')}-${Date.now()}` },
    body: JSON.stringify({
      transaction_amount: Number(valorNum.toFixed(2)),
      description: descricao,
      payment_method_id: 'pix',
      notification_url: `${REDIRECT}?action=webhook`,
      payer: { email, first_name: String(nome).trim().slice(0, 40) },
    }),
  }, token);
  if (!ok || !pay?.id) {
    await sb.from('rifa_numeros').delete().eq('rifa_id', rifa.id).in('numero', numeros).eq('pago', false);
    return json({ error: 'Não deu pra gerar o Pix agora. Tente de novo.' }, 502);
  }

  const td = pay?.point_of_interaction?.transaction_data || {};
  await sb.from('rifa_pagamentos').insert({
    rifa_id: rifa.id, payment_id: String(pay.id), numeros, nome: String(nome).trim(),
    contato: String(contato || '').trim() || null, valor: valorNum, status: pay.status || 'pending',
  });
  await sb.from('rifa_numeros').update({ payment_id: String(pay.id) })
    .eq('rifa_id', rifa.id).in('numero', numeros).eq('pago', false);

  return json({
    ok: true, payment_id: String(pay.id),
    qr_code: td.qr_code || '', qr_code_base64: td.qr_code_base64 || '',
    status: pay.status || 'pending',
  });
}

// ── STATUS: consulta o pagamento ────────────────────────────────
async function status(paymentId: string) {
  if (!paymentId) return json({ error: 'payment_id faltando' }, 400);
  const token = await tokenPorPagamento(paymentId);
  const { ok, data } = await mp(`/v1/payments/${paymentId}`, {}, token);
  if (!ok) return json({ status: 'unknown' });
  const st = data?.status || 'pending';
  if (st === 'approved') await _marcarPago(String(paymentId));
  return json({ status: st });
}

// ── WEBHOOK: o MP avisa; se aprovado, marca os números como pagos ─
async function webhook(req: Request, body: any) {
  const url = new URL(req.url);
  const id = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  const topic = body?.type || url.searchParams.get('type') || url.searchParams.get('topic');
  if ((topic && topic !== 'payment') || !id) return json({ ok: true });
  const token = await tokenPorPagamento(String(id));
  const { ok, data } = await mp(`/v1/payments/${id}`, {}, token);
  if (ok && data?.status === 'approved') await _marcarPago(String(id));
  return json({ ok: true });
}

async function _marcarPago(paymentId: string) {
  await sb.from('rifa_pagamentos').update({ status: 'approved', pago_em: new Date().toISOString() }).eq('payment_id', paymentId);
  await sb.from('rifa_numeros').update({ pago: true }).eq('payment_id', paymentId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  // O Mercado Pago volta do OAuth com ?code&state
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code && state) return await oauthCallback(code, state);

  const action = url.searchParams.get('action') || '';
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
  const act = action || body.action || '';
  try {
    if (act === 'oauth_start') return await oauthStart(req);
    if (act === 'criar') return await criar(body);
    if (act === 'status') return await status(url.searchParams.get('payment_id') || body.payment_id);
    if (act === 'webhook') return await webhook(req, body);
    if (req.method === 'POST') return await webhook(req, body);   // MP às vezes bate sem action
    return json({ error: 'ação inválida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
