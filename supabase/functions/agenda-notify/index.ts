// ═══════════════════════════════════════════════════════════════
// Edge Function: agenda-notify  (deployada como "rapid-handler")
// A página pública chama isto (POST) DEPOIS de criar um agendamento.
// Lê, via SERVICE ROLE, o WhatsApp do profissional (agenda_config.whatsapp) e a
// apikey do CallMeBot (agenda_notify.callmebot_apikey) pelo slug — a apikey
// NUNCA vai pro cliente — e dispara a mensagem pro WhatsApp do profissional.
//
// Pegadinha do 9º dígito (Brasil): o WhatsApp/CallMeBot pode ter registrado o
// número SEM o 9 (contas antigas). Se o envio falhar num número BR de 13
// dígitos, tenta de novo sem o 9.
//
// Deploy: Supabase → Edge Functions → colar isto na função. Verify JWT = OFF.
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function enviar(phone: string, text: string, apikey: string) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}`
    + `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const r = await fetch(url);
  const body = (await r.text());
  const ok = r.ok && !/invalid/i.test(body);
  return { ok, status: r.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  try {
    const { slug, nome, servico, dataTxt, hora, fim } = await req.json();
    if (!slug) return json({ ok: false, error: "slug" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await sb
      .from("agenda_config")
      .select("user_id, whatsapp, titulo")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg?.user_id || !cfg?.whatsapp) return json({ ok: false, reason: "sem-whatsapp" });

    const { data: notif } = await sb
      .from("agenda_notify")
      .select("callmebot_apikey")
      .eq("user_id", cfg.user_id)
      .maybeSingle();
    const apikey = (notif?.callmebot_apikey || "").trim();
    if (!apikey) return json({ ok: false, reason: "sem-apikey" });

    let phone = String(cfg.whatsapp).replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    const text = [
      "📅 *Novo agendamento no Falcon!*",
      `${dataTxt ?? ""} às ${hora ?? ""}${fim ? "–" + fim : ""}`.trim(),
      servico ? `Serviço: ${servico}` : null,
      nome ? `Cliente: ${nome}` : null,
    ].filter(Boolean).join("\n");

    let res = await enviar(phone, text, apikey);

    // Pegadinha do 9: BR 13 dígitos (55 + DDD + 9 + 8) que falhou → tenta sem o 9.
    if (!res.ok && phone.length === 13 && phone[4] === "9") {
      const semNove = phone.slice(0, 4) + phone.slice(5);
      const res2 = await enviar(semNove, text, apikey);
      if (res2.ok) res = res2; else res.body += " | alt: " + res2.body.slice(0, 120);
    }

    return json({ ok: res.ok, status: res.status, body: res.body.slice(0, 300) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
