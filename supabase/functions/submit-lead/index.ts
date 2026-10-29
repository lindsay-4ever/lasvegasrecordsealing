// Supabase Edge Function: receives the eligibility form and saves the lead.
//
// Every submission is checked here, on the server, before anything is saved:
//   1. Size limit (rejects anything over 32 KB).
//   2. Field checks: required fields, lengths, allowed values, email and
//      phone format, consent. Unknown fields are dropped.
//   3. Cloudflare Turnstile: the visitor's browser must pass the bot check.
//   4. Rate limit: at most 5 submissions per hour and 20 per day from the same
//      connection. Only a scrambled (hashed) form of the IP address is kept,
//      for 2 days; the address itself is never stored.
// Then the lead is saved with the server's own key. The website itself can no
// longer write to the database directly (see 13_close_direct_inserts.sql).
//
// Setup (Dashboard → Edge Functions):
//   - Deploy a new function named  submit-lead  and paste this file.
//   - Turn OFF "Verify JWT" for this function (the form has no login; this
//     function does its own checks).
//   - Secrets: TURNSTILE_SECRET_KEY = the secret key from the Cloudflare
//     Turnstile widget. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
//     provided by Supabase automatically.
//
// Nothing from the form is sent anywhere except this database. Cloudflare only
// receives the Turnstile token and the visitor's IP address, never the answers.

const ALLOWED_ORIGINS = [
  "https://lindsay-4ever.github.io",
  "https://lasvegasrecordsealing.com",
  "https://www.lasvegasrecordsealing.com",
];
const MAX_BODY_BYTES = 32_000;
const SITES = ["lasvegasrecordsealing", "nevadasealingrecords"];
const CONTACT_METHODS = ["phone", "text", "email"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Lead = Record<string, unknown>;

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function reply(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

// Field rules: copy only these, with these limits. Mirrors the database checks.
class Invalid extends Error {
  constructor(public field: string) { super(field); }
}
function str(v: unknown, field: string, max: number, opts: { required?: boolean; min?: number } = {}): string | null {
  if (v === undefined || v === null || v === "") {
    if (opts.required) throw new Invalid(field);
    return null;
  }
  if (typeof v !== "string") throw new Invalid(field);
  const s = v.trim();
  if (s.length < (opts.min ?? (opts.required ? 1 : 0)) || s.length > max) throw new Invalid(field);
  return s === "" ? null : s;
}
function oneOf(v: unknown, field: string, allowed: string[], required = false): string | null {
  const s = str(v, field, 40, { required });
  if (s !== null && !allowed.includes(s)) throw new Invalid(field);
  return s;
}
function isoDate(v: unknown, field: string): string | null {
  const s = str(v, field, 10);
  if (s === null) return null;
  if (!DATE_RE.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) throw new Invalid(field);
  return s;
}

export function validateLead(input: Lead): Lead {
  const lead: Lead = {};
  lead.site = oneOf(input.site, "site", SITES, true);
  lead.full_name = str(input.full_name, "full_name", 200, { required: true });
  lead.phone = str(input.phone, "phone", 40, { required: true, min: 7 });
  const digits = String(lead.phone).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Invalid("phone");
  lead.email = str(input.email, "email", 254, { required: true });
  if (!EMAIL_RE.test(String(lead.email))) throw new Invalid("email");
  lead.preferred_contact = oneOf(input.preferred_contact, "preferred_contact", CONTACT_METHODS, true);
  lead.county = str(input.county, "county", 40);
  lead.current_city = str(input.current_city, "current_city", 100);
  lead.current_state = str(input.current_state, "current_state", 40);
  lead.current_country = str(input.current_country, "current_country", 60);
  lead.notes = str(input.notes, "notes", 5000);
  if (input.consent !== true) throw new Invalid("consent");
  lead.consent = true;
  lead.consent_text = str(input.consent_text, "consent_text", 1000);
  lead.outcome = str(input.outcome, "outcome", 40);
  lead.outcome_reason = str(input.outcome_reason, "outcome_reason", 40);
  lead.charge_name = str(input.charge_name, "charge_name", 300);
  lead.charge_nrs = str(input.charge_nrs, "charge_nrs", 200);
  lead.charge_category = str(input.charge_category, "charge_category", 60);
  lead.conviction_date = str(input.conviction_date, "conviction_date", 10);
  lead.completion_date = isoDate(input.completion_date, "completion_date");
  lead.eligible_date = isoDate(input.eligible_date, "eligible_date");
  if (input.wait_years !== undefined && input.wait_years !== null) {
    const w = input.wait_years;
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 50) throw new Invalid("wait_years");
    lead.wait_years = w;
  }
  const answers = input.answers ?? {};
  if (typeof answers !== "object" || Array.isArray(answers) || JSON.stringify(answers).length > 15_000) {
    throw new Invalid("answers");
  }
  lead.answers = answers;
  lead.page_url = str(input.page_url, "page_url", 500);
  lead.user_agent = str(input.user_agent, "user_agent", 500);
  return lead;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dbHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { "apikey": key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) h["Authorization"] = `Bearer ${key}`; // legacy JWT keys
  return h;
}

export async function handle(req: Request, env: (k: string) => string | undefined = (k) => Deno.env.get(k)): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" }, origin);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "origin_not_allowed" }, origin);

  // 1. Size limit
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return reply(413, { error: "too_large" }, origin);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return reply(413, { error: "too_large" }, origin);

  let body: { lead?: Lead; turnstileToken?: unknown; website?: unknown };
  try { body = JSON.parse(raw); } catch { return reply(400, { error: "invalid_request" }, origin); }
  if (!body || typeof body !== "object" || !body.lead || typeof body.lead !== "object") {
    return reply(400, { error: "invalid_request" }, origin);
  }
  // Spam-trap field filled in: pretend it worked, save nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return reply(200, { ok: true }, origin);

  // 2. Field checks
  let lead: Lead;
  try { lead = validateLead(body.lead); } catch (e) {
    if (e instanceof Invalid) return reply(400, { error: "invalid_field", field: e.field }, origin);
    throw e;
  }

  // 3. Turnstile
  const secret = env("TURNSTILE_SECRET_KEY");
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (!secret) { console.error("TURNSTILE_SECRET_KEY is not set"); return reply(500, { error: "server_error" }, origin); }
  if (!token || token.length > 2048) return reply(403, { error: "verification_failed" }, origin);
  const ip = req.headers.get("cf-connecting-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: form, signal: AbortSignal.timeout(8000),
    });
    const result = await v.json();
    if (!result?.success) {
      console.warn("Turnstile rejected:", JSON.stringify(result?.["error-codes"] ?? []));
      return reply(403, { error: "verification_failed" }, origin);
    }
  } catch (e) {
    console.error("Turnstile check failed:", String(e));
    return reply(502, { error: "server_error" }, origin);
  }

  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) { console.error("Supabase URL or key missing"); return reply(500, { error: "server_error" }, origin); }

  // 4. Rate limit (hashed IP; the Turnstile secret doubles as the salt)
  try {
    const keyHash = await sha256(`${secret}|${ip || "unknown"}`);
    const r = await fetch(`${url}/rest/v1/rpc/lead_rate_ok`, {
      method: "POST", headers: dbHeaders(key), body: JSON.stringify({ p_key_hash: keyHash }),
    });
    if (!r.ok) throw new Error(`rate check ${r.status}: ${await r.text()}`);
    if ((await r.json()) !== true) return reply(429, { error: "rate_limited" }, origin);
  } catch (e) {
    console.error("Rate limit check failed:", String(e));
    return reply(500, { error: "server_error" }, origin);
  }

  // Save
  const ins = await fetch(`${url}/rest/v1/leads`, {
    method: "POST",
    headers: { ...dbHeaders(key), "Prefer": "return=minimal" },
    body: JSON.stringify(lead),
  });
  if (!ins.ok) {
    console.error("Insert failed:", ins.status, (await ins.text()).slice(0, 300));
    return reply(500, { error: "server_error" }, origin);
  }
  return reply(200, { ok: true }, origin);
}

Deno.serve((req) => handle(req));
