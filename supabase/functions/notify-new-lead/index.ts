// Supabase Edge Function: emails the office when a new lead is saved.
// Triggered by a Database Webhook on INSERT into public.leads.
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   – from resend.com (free tier is plenty)
//   NOTIFY_TO        – where alerts go, e.g. intake@yourfirm.com (comma-separate for several)
//   NOTIFY_FROM      – a sender on a domain verified in Resend, e.g. leads@lasvegasrecordsealing.com
//   WEBHOOK_SECRET   – any long random string; also add it as the "x-webhook-secret" header on the webhook
//
// The email deliberately leaves out charge and case details — those stay in
// Supabase. Staff open the dashboard to see the full record.

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const payload = await req.json();
  const lead = payload?.record;
  if (payload?.type !== "INSERT" || !lead) return new Response("ignored", { status: 200 });

  const esc = (s: unknown) =>
    String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

  const outcomeLabel: Record<string, string> = {
    packet: "Likely eligible now",
    waiting: "Waiting period not yet met",
    contact: "Needs office review",
  };

  const html = `
    <h2 style="font-family:Georgia,serif;color:#0d2b4e;">New eligibility lead</h2>
    <table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px;">
      <tr><td><b>Name</b></td><td>${esc(lead.full_name)}</td></tr>
      <tr><td><b>Phone</b></td><td>${esc(lead.phone)}</td></tr>
      <tr><td><b>Email</b></td><td>${esc(lead.email)}</td></tr>
      <tr><td><b>Prefers</b></td><td>${esc(lead.preferred_contact)}</td></tr>
      <tr><td><b>County</b></td><td>${esc(lead.county)}</td></tr>
      <tr><td><b>Form result</b></td><td>${esc(outcomeLabel[lead.outcome] ?? lead.outcome)}</td></tr>
      <tr><td><b>Site</b></td><td>${esc(lead.site)}</td></tr>
    </table>
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">
      Full answers are in Supabase → Table Editor → leads.
    </p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM"),
      to: (Deno.env.get("NOTIFY_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      subject: `New lead: ${lead.full_name} (${outcomeLabel[lead.outcome] ?? "review"})`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return new Response("email failed", { status: 502 });
  }
  return new Response("ok", { status: 200 });
});
