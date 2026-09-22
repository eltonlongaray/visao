// ═══════════════════════════════════════════════════════════════
// Edge Function: agenda-notify
// A página pública chama isto (POST) DEPOIS de criar um agendamento.
// Lê, via SERVICE ROLE, o WhatsApp do profissional (agenda_config.whatsapp) e a
// apikey do CallMeBot (agenda_notify.callmebot_apikey) pelo slug — a apikey
// NUNCA vai pro cliente — e dispara a mensagem pro WhatsApp do profissional.
//
// Deploy: Supabase → Edge Functions → nova função "agenda-notify" → colar isto.
// "Verify JWT" = OFF (a página pública é anônima).
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

    // WhatsApp do profissional
    const { data: cfg } = await sb
      .from("agenda_config")
      .select("user_id, whatsapp, titulo")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg?.user_id || !cfg?.whatsapp) return json({ ok: false, reason: "sem-whatsapp" });

    // apikey do CallMeBot (server-only)
    const { data: notif } = await sb
      .from("agenda_notify")
      .select("callmebot_apikey")
      .eq("user_id", cfg.user_id)
      .maybeSingle();
    const apikey = (notif?.callmebot_apikey || "").trim();
    if (!apikey) return json({ ok: false, reason: "sem-apikey" });

    let phone = String(cfg.whatsapp).replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    const linhas = [
      "📅 *Novo agendamento no Falcon!*",
      `${dataTxt ?? ""} às ${hora ?? ""}${fim ? "–" + fim : ""}`.trim(),
      servico ? `Serviço: ${servico}` : null,
      nome ? `Cliente: ${nome}` : null,
    ].filter(Boolean);

    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}`
      + `&text=${encodeURIComponent(linhas.join("\n"))}`
      + `&apikey=${encodeURIComponent(apikey)}`;

    const r = await fetch(url);
    const body = (await r.text()).slice(0, 300);
    return json({ ok: r.ok, status: r.status, body });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
