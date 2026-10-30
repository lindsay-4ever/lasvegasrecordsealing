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

Supabase doesn't email you on its own. `supabase/functions/notify-new-lead/` sends a short alert through Resend. The alert contains **no lead details** (no name, phone, email, charge or result), only the time and a link to Supabase, so nothing from the form passes through an email inbox.

1. Sign up at resend.com with the email address that should get the alerts, and create an API key. No domain is needed yet: until you verify one, Resend can send from `onboarding@resend.dev`, but only to the address you signed up with.
2. Supabase → **Edge Functions → Deploy a new function → Via editor**, paste `index.ts`, deploy. Turn **off** "Verify JWT" for this function (the webhook uses its own secret instead).
3. **Edge Functions → Secrets**: add `RESEND_API_KEY`, `NOTIFY_TO` (your Resend sign-up email), `NOTIFY_FROM` = `Las Vegas Record Sealing <onboarding@resend.dev>`, and `WEBHOOK_SECRET` (any long random string, e.g. from a password generator).
4. **Database → Webhooks → Create**: table `leads`, event **Insert**, type **Supabase Edge Functions**, pick this function, method POST, and add the HTTP header `x-webhook-secret` = the same random string.
5. Submit a test lead; the email should arrive within a minute. Delete the test row.

Later, once the business email exists: verify lasvegasrecordsealing.com in Resend (it gives DNS records to add at Network Solutions), then change `NOTIFY_FROM` to e.g. `leads@lasvegasrecordsealing.com` and add other recipients to `NOTIFY_TO`.

## Working the leads

Staff use the dashboard at **lasvegasrecordsealing.com/staff** (see "Staff dashboard" below). In Table Editor you can also change `status` as you go (`new → contacted → qualified → retained`, or `not_eligible` / `closed`) and use `staff_notes` for call notes. Every raw form answer is kept in `answers`.

## Keeping it safe

These rows link real people to criminal-record details. Turn on two-factor login for every Supabase account with access, only invite people who need it, and never paste the secret key anywhere public. Have Ken confirm how long leads should be kept and whether a privacy notice is needed on the form.

## Reusing for nevadasealingrecords.com

The table already accepts `site = 'nevadasealingrecords'`. Copy the same submit code into that site's form and set `LEAD_SITE = 'nevadasealingrecords'`.

## Eligibility reminders (not eligible yet)
Run `10_eligibility_reminder.sql` once. Every "waiting" lead gets `eligibility_reminder = true` automatically. **Table Editor → upcoming_eligibility** lists everyone eligible within the next 60 days, soonest first, plus anyone whose date has passed and is still "new". Change a lead's status to "contacted" to take them off the list, or untick `eligibility_reminder` if they ask not to be reminded.

## Lead numbers
Run `15_lead_number.sql` once (delete test leads first if you want real leads to start at 1). Every lead gets `lead_number` 1, 2, 3, ... oldest first, and each new lead gets the next number automatically. It's the last column in Table Editor. The website can't set it, and the new-lead email shows it ("New lead #42"). A number can occasionally be skipped if a save fails; that's harmless.

## Staff dashboard (lasvegasrecordsealing.com/staff)
A private page where staff see leads and update their status and notes, without access to Supabase itself. Access rules are in `16_staff_dashboard.sql`: a person sees leads only if they signed in with an account you created, entered the 6-digit code from their authenticator app, and their email is in `staff_members`. Staff can change only status, staff notes and the eligibility reminder; every change records who made it (`updated_by`, `updated_at`). They can't delete leads or edit what the person entered.

Setup (once):
1. **SQL Editor:** run `15_lead_number.sql` (if not done yet), then `16_staff_dashboard.sql`.
2. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up", then save. Only accounts you create can sign in.
3. **Authentication → Multi-Factor:** check that TOTP (authenticator app) is enabled. It is by default.
4. **Authentication → Users → Add user → Create new user**, once per person: their email, a temporary password of 12+ characters, and tick **Auto Confirm User**.
5. **Table Editor → staff_members → Insert row**, once per person: `email` (lowercase, the same as their login) and `name`.
6. Send each person the link, their email and temporary password (by text or phone, not in the same email). On first sign-in they scan a QR code with Google Authenticator, Microsoft Authenticator or their password manager. They can change their password from the dashboard.

Day to day:
- **Remove someone:** delete their row in `staff_members` (access ends immediately), then delete their user in Authentication → Users.
- **Forgot password, new phone or lost authenticator:** delete their user in Authentication → Users and create it again with a new temporary password (their `staff_members` row stays). On their next sign-in they set up the code again. Don't use "send password recovery": the dashboard doesn't handle those links.

## Website security settings
Every page has a Content-Security-Policy tag near the top of its `<head>`. It only lets the site load its own files and only lets the form send data to this Supabase project, so injected or third-party code can't send visitors' answers anywhere else. If you add Google Tag Manager, GA4 or the Meta Pixel, add only their domains to that tag on every page, then rerun the network audit. Pages also hide themselves if another site tries to show them inside a frame. `_config.yml` keeps this `supabase/` folder off the public website (it is still visible in the GitHub repo while the repo is public).

## Charge list v8 (special cases)
Run `11_charge_list_v8.sql` once after the v8 charge list goes live. It replaces the special-case charges in `charge_special_cases` (the old names no longer exist) with the 71 from the v8 charge sheet, each with a staff note. Some charges are special cases only if the offense happened before a certain date; for those, the form asks when the offense happened, and a lead is flagged `special_case` only when the form actually treated it as one.

## Spam protection (Cloudflare Turnstile + submit-lead function)
The form sends leads to the `submit-lead` Edge Function instead of writing to the database directly. The function rejects anything over 32 KB, re-checks every field, verifies the Cloudflare Turnstile spam check, allows at most 5 submissions per hour and 20 per day from one connection (only a hashed IP is kept, for 2 days), and then saves the lead. Cloudflare only sees the Turnstile token and IP address, never the form answers.

Order matters. Do these in sequence so the form never stops saving leads:
1. **SQL Editor:** run `12_submit_lead_function.sql` (adds the rate-limit table).
2. **Edge Functions → Deploy a new function → Via editor:** name it `submit-lead`, paste `functions/submit-lead/index.ts`, deploy. (The deployed function shows the name `submit-lead`, but its web address is `/functions/v1/super-task`; `LEAD_ENDPOINT` in `eligibility.html` must match the address shown in Edge Functions.) Then open the function's settings and turn **off** "Verify JWT" (Enforce JWT verification).
3. **Edge Functions → Secrets:** add `TURNSTILE_SECRET_KEY` = the secret key from Cloudflare → Turnstile → the widget.
4. Publish the website (the form now posts to the function), submit a test lead, check it appears in `leads`, then delete it.
5. **SQL Editor:** run `13_close_direct_inserts.sql`. After this the website can no longer write to `leads` directly; only the function can.
6. **SQL Editor:** run `14_atomic_lead_submit.sql`, then paste the updated `functions/submit-lead/index.ts` into the function editor and deploy again. The lead and its rate-limit entry are then saved in one step (no double-counting when two requests arrive together, no penalty if saving fails), the visitor IP comes only from headers set by Supabase's network, and requests with no trusted IP skip the rate limit instead of sharing one bucket.

Turnstile widget (Cloudflare → Application security → Turnstile): hostnames `lindsay-4ever.github.io` and `lasvegasrecordsealing.com`, mode Managed. The site key is in `eligibility.html` (`TURNSTILE_SITE_KEY`); the secret key goes only in Supabase.
