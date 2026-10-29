-- ============================================================================
-- Spam protection, part 3: save each lead and its rate-limit entry together.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. Does not change any leads.
-- Run this BEFORE redeploying the updated submit-lead function code; the new
-- code calls lead_submit(). (The old code keeps working until then.)
-- ============================================================================
-- What it fixes:
-- 1. Two submissions arriving at the same moment from one visitor could both
--    pass the "fewer than 5 this hour" check before either was recorded.
--    lead_submit() now takes a lock per visitor, so they are checked one at
--    a time.
-- 2. If saving the lead fails, the visitor's attempt is not counted against
--    their limit: the lead and the rate-limit entry are saved in one step,
--    and both are undone together on any error.
-- 3. If the visitor's IP address is missing, p_key_hash is null and no limit
--    is applied (the Cloudflare check still is), instead of putting every
--    such visitor in one shared bucket.
-- Only the columns the website is allowed to fill in are copied; status,
-- staff_notes, id and timestamps keep their defaults, and the special-case,
-- reminder and Pacific-time triggers still run.
-- ============================================================================

create or replace function public.lead_submit(p_key_hash text, p_lead jsonb)
returns text            -- 'ok' or 'rate_limited'
language plpgsql
security definer
set search_path = public
as $$
declare
  per_hour constant int := 5;
  per_day  constant int := 20;
  n_hour int;
  n_day  int;
begin
  if p_key_hash is not null then
    -- One visitor at a time; released automatically when this call ends.
    perform pg_advisory_xact_lock(hashtextextended('lead_submit:' || p_key_hash, 0));

    delete from public.lead_rate_limits where created_at < now() - interval '2 days';

    select count(*) filter (where created_at > now() - interval '1 hour'),
           count(*)
      into n_hour, n_day
      from public.lead_rate_limits
     where key_hash = p_key_hash
       and created_at > now() - interval '1 day';

    if n_hour >= per_hour or n_day >= per_day then
      return 'rate_limited';
    end if;
  end if;

  insert into public.leads (
    site, full_name, phone, email, preferred_contact, county, notes,
    consent, consent_text, outcome, outcome_reason,
    charge_name, charge_nrs, charge_category,
    conviction_date, completion_date, eligible_date, wait_years,
    answers, page_url, user_agent,
    current_city, current_state, current_country
  )
  select
    r.site, r.full_name, r.phone, r.email, r.preferred_contact, r.county, r.notes,
    r.consent, r.consent_text, r.outcome, r.outcome_reason,
    r.charge_name, r.charge_nrs, r.charge_category,
    r.conviction_date, r.completion_date, r.eligible_date, r.wait_years,
    coalesce(r.answers, '{}'::jsonb), r.page_url, r.user_agent,
    r.current_city, r.current_state, r.current_country
  from jsonb_populate_record(null::public.leads, p_lead) as r;

  if p_key_hash is not null then
    insert into public.lead_rate_limits (key_hash) values (p_key_hash);
  end if;

  return 'ok';
end;
$$;

revoke all on function public.lead_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_submit(text, jsonb) to service_role;
