# Supabase setup — Las Vegas Record Sealing eligibility form

Until this is done, the eligibility form shows people their result but **saves nothing** — no one is notified and the lead is lost.

## 1. Create the table (2 minutes)

1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/01_leads_table.sql` → **Run**. You should see "Success. No rows returned."
3. **Table Editor** → you'll now see a `leads` table.

What it does: the public website can *add* leads but can never read, change or delete them. You see and manage them in the dashboard.

## 2. Connect the form (2 minutes)

1. Dashboard → **Project Settings → API Keys** (older projects: **Settings → API**).
2. Copy the **Project URL** and the **publishable** key (starts `sb_publishable_…`; older projects call it the **anon / public** key).
   - Do **not** use the `secret` / `service_role` key — that one must never go on a website.
3. In `eligibility.html`, near the top of the `<script>`, replace:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   const SUPABASE_PUBLIC_KEY = 'YOUR-PUBLISHABLE-OR-ANON-KEY';
   ```
4. Commit and push to GitHub. Pages updates in about a minute.

## 3. Test it

Fill in the live form with test details → **See My Results** → check **Table Editor → leads**. A new row with status `new` should appear. Delete the test row afterward.

If the button shows an error instead, open the browser console (right-click → Inspect → Console) for the message:
- `401` / `Invalid API key` → wrong key pasted, or the secret key was used.
- `404` / `relation "leads" does not exist` → step 1 wasn't run, or the Data API is switched off for the `public` schema (Project Settings → Data API).
- `permission denied` / `row-level security` → re-run the SQL file.

## 4. Get emailed when a lead comes in (optional, ~15 minutes)

Supabase doesn't email you on its own. `supabase/functions/notify-new-lead/` sends a short alert (name, phone, county, result — **no charge details**) through Resend.

1. Sign up at resend.com, verify a sending domain (e.g. lasvegasrecordsealing.com), create an API key.
2. Supabase → **Edge Functions → Deploy a new function → Via editor**, name it `notify-new-lead`, paste `index.ts`, deploy. **Turn off "Verify JWT"** for this function (the webhook uses its own secret instead).
3. **Edge Functions → Secrets**: add `RESEND_API_KEY`, `NOTIFY_TO`, `NOTIFY_FROM`, `WEBHOOK_SECRET` (any long random string).
4. **Database → Webhooks → Create**: table `leads`, event **Insert**, type **Supabase Edge Functions**, function `notify-new-lead`, add HTTP header `x-webhook-secret` = the same random string.
5. Submit another test lead — the email should arrive within seconds.

## Working the leads

In Table Editor, change `status` as you go (`new → contacted → qualified → retained`, or `not_eligible` / `closed`) and use `staff_notes` for call notes. Every raw form answer is kept in `answers`.

## Keeping it safe

These rows link real people to criminal-record details. Turn on two-factor login for every Supabase account with access, only invite people who need it, and never paste the secret key anywhere public. Have Ken confirm how long leads should be kept and whether a privacy notice is needed on the form.

## Reusing for nevadasealingrecords.com

The table already accepts `site = 'nevadasealingrecords'`. Copy the same submit code into that site's form and set `LEAD_SITE = 'nevadasealingrecords'`.
