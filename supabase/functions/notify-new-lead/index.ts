// Supabase Edge Function: emails the office when a new lead is saved.
// Triggered by a Database Webhook on INSERT into public.leads.
//
// The email contains NO lead details: no name, phone, email, charge, result or
// answers. It only says a new lead arrived and when. Staff open Supabase to see
// the lead. That way nothing from the form passes through an email provider or
// inbox (Gmail / Google Workspace included).
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   – from resend.com (free plan is plenty)
//   NOTIFY_TO        – where alerts go (comma-separate for several). Until a
//                      domain is verified in Resend, this must be the email
//                      address you signed up to Resend with.
//   NOTIFY_FROM      – the sender. Until a domain is verified in Resend, use:
//                      Las Vegas Record Sealing <onboarding@resend.dev>
//                      Later: leads@lasvegasrecordsealing.com (after verifying
//                      the domain in Resend).
//   WEBHOOK_SECRET   – any long random string; also add it as the
//                      "x-webhook-secret" header on the database webhook.
// Turn OFF "Verify JWT" for this function; the webhook secret protects it.

const DASHBOARD_URL = "https://supabase.com/dashboard/project/ubtmdxknrhdeqtixhyri/editor";

export async function handle(req: Request, env: (k: string) => string | undefined = (k) => Deno.env.get(k)): Promise<Response> {
  const secret = env("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  const lead = payload?.record;
  if (payload?.type !== "INSERT" || !lead) return new Response("ignored", { status: 200 });

  // Only the time and which website; nothing the visitor typed.
  const when = new Date(String(lead.created_at ?? Date.now())).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
  });
  const site = lead.site === "nevadasealingrecords" ? "Nevada Sealing Records" : "Las Vegas Record Sealing";

  const text = `A new eligibility form was submitted on ${site} at ${when} (Pacific time).\n\n` +
    `Open Supabase to see it: Table Editor → leads.\n${DASHBOARD_URL}\n\n` +
    `For privacy, this email doesn't include any details from the form.`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
      <h2 style="font-family:Georgia,serif;color:#0d2b4e;margin:0 0 12px;">New lead received</h2>
      <p>A new eligibility form was submitted on <b>${site}</b> at <b>${when}</b> (Pacific time).</p>
      <p><a href="${DASHBOARD_URL}" style="color:#0d2b4e;font-weight:bold;">Open Supabase → Table Editor → leads</a></p>
      <p style="color:#666;font-size:12px;">For privacy, this email doesn't include any details from the form.</p>
    </div>`;

  const to = (env("NOTIFY_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!env("RESEND_API_KEY") || !env("NOTIFY_FROM") || !to.length) {
    console.error("Email settings missing (RESEND_API_KEY, NOTIFY_FROM or NOTIFY_TO)");
    return new Response("not configured", { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("NOTIFY_FROM"), to, subject: `New lead: ${site}`, text, html }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, (await res.text()).slice(0, 300));
    return new Response("email failed", { status: 502 });
  }
  return new Response("ok", { status: 200 });
}

Deno.serve((req) => handle(req));
