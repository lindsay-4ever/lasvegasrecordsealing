// Supabase Edge Function: emails the office when certain new leads are saved.
// Triggered by a Database Webhook on INSERT into public.leads.
//
// Two kinds of lead send an email:
//   - eligible now (outcome "packet"): "New eligible lead detected"
//   - needs review (outcome "contact": the result page said "Your case needs a
//     personal review from our office", e.g. no completion date, a special-case
//     charge, "I can't find my charge"): "New lead detected — needs review"
// Leads that aren't eligible yet (outcome "waiting") show only in the staff
// dashboard.
//
// The email contains NO lead details: no name, phone, email, charge or answers.
// It gives the subject line, the internal lead number, and a link to the staff
// dashboard login. That way nothing from the form passes through an email
// provider or inbox.
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   – from resend.com (free plan is plenty)
//   NOTIFY_TO        – where alerts go (comma-separate for several), e.g.
//                      clarissa@kenstoverlaw.com. Resend only delivers to other
//                      people's addresses once a domain is verified in Resend.
//   NOTIFY_FROM      – the sender, on the verified domain, e.g.
//                      Las Vegas Record Sealing <leads@lasvegasrecordsealing.com>
//   WEBHOOK_SECRET   – any long random string; also add it as the
//                      "x-webhook-secret" header on the database webhook.
//   DASHBOARD_URL    – optional: only if the dashboard moves to a new address.
// Turn OFF "Verify JWT" for this function; the webhook secret protects it.

// Where the email's link points: the staff dashboard login. The DASHBOARD_URL
// secret overrides it if the dashboard moves (it must be an https address).
const DEFAULT_DASHBOARD_URL = "https://staff-dashboard-6sv.pages.dev/";
export function dashboardLink(env: (k: string) => string | undefined): string {
  const dash = (env("DASHBOARD_URL") ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/.test(dash) ? dash : DEFAULT_DASHBOARD_URL;
}

// The form's "eligible now" result.
export const isEligibleNow = (lead: Record<string, unknown>) => lead.outcome === "packet";

// Which email (if any) a new lead gets.
export function notifyKind(lead: Record<string, unknown>): "eligible" | "review" | null {
  if (isEligibleNow(lead)) return "eligible";
  if (lead.outcome === "contact") return "review";
  return null;
}

export async function handle(req: Request, env: (k: string) => string | undefined = (k) => Deno.env.get(k)): Promise<Response> {
  const secret = env("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  const lead = payload?.record;
  if (payload?.type !== "INSERT" || !lead) return new Response("ignored", { status: 200 });

  // Only eligible-now and needs-review leads get an email.
  const kind = notifyKind(lead);
  if (!kind) return new Response("no email for this lead", { status: 200 });

  // Nothing the visitor typed: only the internal lead number.
  const no = lead.lead_number != null ? ` (#${Number(lead.lead_number)})` : "";
  const url = dashboardLink(env);
  // Nevada Sealing Records leads say which site they came from; Las Vegas
  // emails stay exactly as they were (no prefix).
  const sitePrefix = lead.site === "nevadasealingrecords" ? "Nevada Sealing Records: " : "";
  const headline = sitePrefix + (kind === "eligible"
    ? `New eligible lead detected${no}`
    : `New lead detected — needs review${no}`);
  const note = kind === "review"
    ? "The form couldn't confirm their eligibility online, so they were told our office will review their case."
    : "";
  const subject = headline;

  const text = `${headline}.\n\n${note ? note + "\n\n" : ""}Log in to the staff dashboard to see it:\n${url}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
      <h2 style="font-family:Georgia,serif;color:#0d2b4e;margin:0 0 12px;">${headline}</h2>
      ${note ? `<p>${note}</p>` : ""}
      <p><a href="${url}" style="display:inline-block;background:#0d2b4e;color:#ffffff;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:6px;">Log in to the staff dashboard</a></p>
      <p style="color:#666;font-size:12px;">Or paste this address into your browser: ${url}</p>
    </div>`;

  const to = (env("NOTIFY_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!env("RESEND_API_KEY") || !env("NOTIFY_FROM") || !to.length) {
    console.error("Email settings missing (RESEND_API_KEY, NOTIFY_FROM or NOTIFY_TO)");
    return new Response("not configured", { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("NOTIFY_FROM"), to, subject, text, html }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, (await res.text()).slice(0, 300));
    return new Response("email failed", { status: 502 });
  }
  return new Response("ok", { status: 200 });
}

Deno.serve((req) => handle(req));
