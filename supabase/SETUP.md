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

## 4. Get emailed when an eligible lead comes in (~15 minutes)

Supabase doesn't email you on its own. `supabase/functions/notify-new-lead/` sends a short alert through Resend, **only for leads the form found eligible now**. Leads that aren't eligible yet or need Ken's review show only in the staff dashboard. The alert says "New eligible lead detected (#N)" with a button to log in to the staff dashboard (https://staff-dashboard-6sv.pages.dev/). It contains **no lead details** (no name, phone, email, charge or answers), so nothing from the form passes through an email inbox.

1. **Resend:** sign up at resend.com and create an API key. To send to anyone other than your own sign-up address (e.g. clarissa@kenstoverlaw.com), verify the domain: Resend → **Domains → Add domain** → `lasvegasrecordsealing.com`, add the DNS records it shows at Network Solutions, then click **Verify**. The records only cover sending from Resend; they don't change the site or any existing mailbox.
2. Supabase → **Edge Functions → Deploy a new function → Via editor** (or open the existing `notify-new-lead`), paste `index.ts`, deploy. Turn **off** "Verify JWT" for this function (the webhook uses its own secret instead).
3. **Edge Functions → Secrets**: `RESEND_API_KEY`, `NOTIFY_TO` = `clarissa@kenstoverlaw.com` (comma-separate to add more people), `NOTIFY_FROM` = `Las Vegas Record Sealing <leads@lasvegasrecordsealing.com>` (any name @ the verified domain; it doesn't need a mailbox), and `WEBHOOK_SECRET` (any long random string, e.g. from a password generator). `DASHBOARD_URL` is only needed if the dashboard moves to a new address.
4. **Database → Webhooks → Create** (skip if it already exists): table `leads`, event **Insert**, type **Supabase Edge Functions**, pick this function, method POST, and add the HTTP header `x-webhook-secret` = the same random string.
5. Submit a test lead that comes out eligible (e.g. charges dismissed); the email should arrive within a minute. Then delete the test rows.

If no email arrives: Edge Functions → notify-new-lead → **Logs**. "not eligible now: no email" means the test lead wasn't an eligible-now result; a "Resend error" that mentions testing emails or your own email address means the domain isn't verified yet.

## Working the leads

In Table Editor, change `status` as you go (`new → contacted → qualified → retained`, or `not_eligible` / `closed`) and use `staff_notes` for call notes. Every raw form answer is kept in `answers`.

## Keeping it safe

These rows link real people to criminal-record details. Turn on two-factor login for every Supabase account with access, only invite people who need it, and never paste the secret key anywhere public. Have Ken confirm how long leads should be kept and whether a privacy notice is needed on the form.

## Reusing for nevadasealingrecords.com

The table already accepts `site = 'nevadasealingrecords'`. Copy the same submit code into that site's form and set `LEAD_SITE = 'nevadasealingrecords'`.

## Eligibility reminders (not eligible yet)
Run `10_eligibility_reminder.sql` once. Every "waiting" lead gets `eligibility_reminder = true` automatically. **Table Editor → upcoming_eligibility** lists everyone eligible within the next 60 days, soonest first, plus anyone whose date has passed and is still "new". Change a lead's status to "contacted" to take them off the list, or untick `eligibility_reminder` if they ask not to be reminded.

## Lead numbers
Run `15_lead_number.sql` once (delete test leads first if you want real leads to start at 1). Every lead gets `lead_number` 1, 2, 3, ... oldest first, and each new lead gets the next number automatically. It's the last column in Table Editor. The website can't set it, and the new-lead email shows it ("New lead #42"). A number can occasionally be skipped if a save fails; that's harmless.

## Website security settings
Every page has a Content-Security-Policy tag near the top of its `<head>`. It lets the site load only its own files plus Google Tag Manager, Google Analytics, Google Ads and the Meta Pixel (domains from Google's CSP guide plus Meta's two), and lets the form send data only to this Supabase project. Don't add other domains. If you ever add a new tool, add only its domains to that tag on every page, then rerun the network audit. Pages also hide themselves if another site tries to show them inside a frame. `_config.yml` keeps this `supabase/` folder off the public website (it is still visible in the GitHub repo while the repo is public).

## Charge list v8 (special cases)
Run `11_charge_list_v8.sql` once after the v8 charge list goes live. It replaces the special-case charges in `charge_special_cases` (the old names no longer exist) with the 71 from the v8 charge sheet, each with a staff note. Some charges are special cases only if the offense happened before a certain date (the law changed then). Since Oct 30 the form no longer asks when the offense happened: those 55 charges get their current waiting period from the sentence completion date, and Ken checks the offense date during the phone consultation. A lead is flagged `special_case` only when the form actually treated it as one (the 16 charges whose wait always depends on the facts); the staff notes for the date-dependent charges are still in `charge_special_cases`.

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

## Tracking (Google Tag Manager, GA4, Meta Pixel)
Every real page loads Tag Manager (container `GTM-57JJNV39`) from `js/gtm.js`. The two "page moved" redirect pages don't, so visits through them aren't counted twice. GA4, Google Ads and the Meta Pixel are set up inside Tag Manager, not in the site's code. Nothing is sent to Google or Meta until a Tag Manager version is published.

The form sends Tag Manager two events, and neither carries any details (no answers, name, contact info, charge, county or result):
- `form_started`: the first time someone answers a question and continues (once per visit to the page).
- `lead_submitted`: only after the lead is saved, the same for every lead. The form's address and page title never change as people answer, so page views don't reveal answers either.

Rules, because these leads involve criminal records:
- Google and Meta get page views, `form_started` and `lead_submitted` only. Never add variables, parameters or event names that carry form answers, click text or form field values, and never make separate events or pages per result.
- Meta Pixel settings (Events Manager → the pixel → Settings): Automatic advanced matching **off**, automatic events / "track events automatically without code" **off**. In Tag Manager's Meta Pixel tag, also turn off automatic configuration.
- Google: Enhanced conversions **off** in Google Ads, user-provided data collection **off** in GA4, and Enhanced measurement → Form interactions **off** in the GA4 data stream.
- Google treats criminal records as a sensitive category: no Google remarketing lists, customer lists or lookalikes. Conversion tracking and search ads are fine.
- Meta retargeting: build audiences from page visits, `form_started` and `lead_submitted` only (for example, started but didn't finish). Ads must describe the service and never imply the viewer has a criminal record (Meta's personal attributes policy).
- Keep Tag Manager access to as few people as possible: anyone with publish access can add tracking to the site.
- After any Tag Manager change, submit a test lead and check every request the page sends (browser DevTools → Network) for names, phone numbers, emails, charges or results.

## Lead source (paid vs organic)
Each lead records where the person came from: `source_channel` (paid_search, paid_social, paid_other, organic_search, organic_social, email, referral or direct), `source_paid` (true/false), the ad link's campaign labels (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`), the referring site's domain, the first page they landed on, and when they arrived. `js/lead-source.js` notes this in the visitor's browser (the most recent non-direct arrival, for up to 90 days) and the form sends it with the lead. It is stored only in this database and never sent to Google or Meta. Ad platforms' click IDs are used only to recognize a paid click and are not saved.

Setup, in this order (any order is safe; the source just isn't saved until all three are done):
1. **SQL Editor:** run `24_lead_source.sql` (adds the columns, updates `lead_submit()`, adds the `lead_sources_by_month` view).
2. **Edge Functions → submit-lead:** paste the updated `functions/submit-lead/index.ts` and deploy. The function cleans source fields instead of rejecting them, so an odd ad link can never cost a lead.
3. Publish the website.

See it: **Table Editor → leads** (the source columns are at the end) or **Table Editor → lead_sources_by_month** (lead counts per month: paid vs organic, channel, source and campaign).

Tag your ads so their campaigns show up:
- **Meta:** in each ad, under Destination → URL parameters, paste
  `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`
  Untagged Meta ads look like organic Facebook/Instagram traffic.
- **Google Ads:** keep auto-tagging on; Google ad clicks are recognized as paid search even without tags. To see campaigns, set Admin → Account settings → Tracking → Final URL suffix to
  `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}`
  (campaign IDs are the numbers shown in Google Ads).
- **Anything else you share** (email, partner sites): add `utm_source=…&utm_medium=email` (or `referral`) and a `utm_campaign`.
Name campaigns plainly: campaign names end up in this database, and Meta and Google already see them.

## Fix: "not eligible yet" leads with special-case charges weren't saved
Run `25_fix_waiting_special_case.sql` once. Since `11_charge_list_v8.sql`, a lead whose charge is on the special-case list (for example petit larceny or burglary) and who is still in their waiting period was refused by the database, and the visitor saw "we couldn't send your information". To see whether it happened: Edge Functions → submit-lead → Logs, search for "Saving the lead failed" with `special_case` in the message.

Note on numbering: SQL files 16–23 are in the staff dashboard repo (lindsay-4ever/staff-dashboard); this repo continues at 24.
