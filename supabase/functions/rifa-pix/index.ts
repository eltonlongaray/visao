// ═══════════════════════════════════════════════════════════════
// FALCON RIFA — Edge Function (Supabase / Deno)
// Backend seguro do Pix via Mercado Pago. A chave secreta (MP_ACCESS_TOKEN)
// fica AQUI no servidor, nunca no app.
//
// Ações (via ?action= ou body.action):
//   criar   → reserva os números + cria o Pix no MP → devolve QR + copia-e-cola
//   status  → consulta o pagamento no MP → devolve 'approved'/'pending'/...
//   webhook → MP avisa quando o pagamento cai → marca os números como pagos
//
// Deploy:  supabase functions deploy rifa-pix --no-verify-jwt
// Segredo: supabase secrets set MP_ACCESS_TOKEN=APP_USR-...
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || '';
const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const sb = createClient(SB_URL, SB_SERVICE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function mp(path: string, opts: RequestInit = {}) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

// ── CRIAR: reserva os números + cria o Pix ──────────────────────
async function criar(body: any) {
  const { slug, numeros, nome, contato, valor } = body;
  if (!slug || !Array.isArray(numeros) || !numeros.length) return json({ error: 'Dados incompletos' }, 400);
  if (!nome || String(nome).trim().length < 2) return json({ error: 'Informe seu nome' }, 400);
  const valorNum = Number(valor);
  if (!(valorNum > 0)) return json({ error: 'Valor inválido' }, 400);

  // rifa
  const { data: rifa } = await sb.from('rifas').select('id, titulo, ativo').eq('slug', slug).maybeSingle();
  if (!rifa || !rifa.ativo) return json({ error: 'Rifa indisponível' }, 400);

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

  // cria o Pix no Mercado Pago
  const descricao = `Rifa: ${rifa.titulo || 'Falcon Rifa'} — nº ${numeros.join(', ')}`;
  const emailPagador = `rifa_${String(contato || '').replace(/\D/g, '') || Date.now()}@estilo-falcon.web.app`;
  const { ok, data: pay } = await mp('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': `rifa-${rifa.id}-${numeros.join('-')}-${Date.now()}` },
    body: JSON.stringify({
      transaction_amount: Number(valorNum.toFixed(2)),
      description: descricao,
      payment_method_id: 'pix',
      payer: { email: emailPagador, first_name: String(nome).trim().slice(0, 40) },
    }),
  });
  if (!ok || !pay?.id) {
    // desfaz a reserva se o Pix não foi criado
    await sb.from('rifa_numeros').delete().eq('rifa_id', rifa.id).in('numero', numeros).eq('pago', false);
    return json({ error: 'Não deu pra gerar o Pix agora. Tente de novo.' }, 502);
  }

  const td = pay?.point_of_interaction?.transaction_data || {};
  // guarda o pagamento ↔ números
  await sb.from('rifa_pagamentos').insert({
    rifa_id: rifa.id, payment_id: String(pay.id), numeros, nome: String(nome).trim(),
    contato: String(contato || '').trim() || null, valor: valorNum, status: pay.status || 'pending',
  });
  // vincula o payment_id nos números reservados
  await sb.from('rifa_numeros').update({ payment_id: String(pay.id) })
    .eq('rifa_id', rifa.id).in('numero', numeros).eq('pago', false);

  return json({
    ok: true,
    payment_id: String(pay.id),
    qr_code: td.qr_code || '',
    qr_code_base64: td.qr_code_base64 || '',
    status: pay.status || 'pending',
  });
}

// ── STATUS: consulta o pagamento no MP ─────────────────────────
async function status(paymentId: string) {
  if (!paymentId) return json({ error: 'payment_id faltando' }, 400);
  const { ok, data } = await mp(`/v1/payments/${paymentId}`);
  if (!ok) return json({ status: 'unknown' });
  const st = data?.status || 'pending';
  if (st === 'approved') await _marcarPago(String(paymentId));
  return json({ status: st });
}

// ── WEBHOOK: MP avisa; se aprovado, marca os números como pagos ─
async function webhook(req: Request, body: any) {
  const url = new URL(req.url);
  const id = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  const topic = body?.type || url.searchParams.get('type') || url.searchParams.get('topic');
  if ((topic && topic !== 'payment') || !id) return json({ ok: true });
  const { ok, data } = await mp(`/v1/payments/${id}`);
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
  const action = url.searchParams.get('action') || '';
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
  const act = action || body.action || '';
  try {
    if (act === 'criar') return await criar(body);
    if (act === 'status') return await status(url.searchParams.get('payment_id') || body.payment_id);
    if (act === 'webhook') return await webhook(req, body);
    // MP às vezes bate sem action → trata como webhook
    if (req.method === 'POST') return await webhook(req, body);
    return json({ error: 'ação inválida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
