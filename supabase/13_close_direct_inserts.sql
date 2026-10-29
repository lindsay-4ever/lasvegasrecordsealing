-- ============================================================================
-- Spam protection, part 2: stop the website writing to the leads table directly.
-- Run ONLY AFTER the new form (which sends leads through the submit-lead
-- function) is live and a test lead has saved successfully. Running it
-- earlier would make the old form fail to save leads.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run
-- more than once. Does not change any leads.
-- ============================================================================
-- After this, the only way into public.leads is the submit-lead function,
-- which checks the Cloudflare Turnstile result, every field and the rate
-- limit first. The function saves leads with the server's own key, so the
-- triggers (special cases, eligibility reminders, Pacific time) still run.
-- To undo: re-run the "grant insert" and "create policy" part of
-- 09_move_pacific_time_column.sql.
-- ============================================================================

drop policy if exists "Website can submit leads" on public.leads;
revoke insert on public.leads from anon, authenticated;

-- Check: should return no rows (the website has no insert rights left)
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'leads' and grantee in ('anon', 'authenticated');
