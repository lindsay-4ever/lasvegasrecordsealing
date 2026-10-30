-- ============================================================================
-- Lead source: where each lead came from (paid ad, search, social, direct).
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. Existing leads are not changed (their source
-- columns stay empty).
-- Order: run this, then redeploy the submit-lead function (updated code), then
-- publish the website. Any other order is also safe: until every piece is in
-- place, the source is simply not saved.
-- ============================================================================
-- New columns on leads (filled in by the website through submit-lead):
--   source_channel   paid_search, paid_social, paid_other, organic_search,
--                    organic_social, email, referral or direct
--   source_paid      true for paid ads, false otherwise (set by submit-lead
--                    from source_channel)
--   utm_source / utm_medium / utm_campaign / utm_content / utm_term
--                    the campaign labels on the ad link that brought them
--   referrer_domain  the site they came from (e.g. google.com), domain only
--   landing_page     the first page they landed on (e.g. /pricing)
--   source_seen_at   when they arrived from that source
-- Nothing here is sent to Google or Meta; it stays in this database.
-- ============================================================================

alter table public.leads
  add column if not exists source_channel  text check (source_channel in
    ('paid_search','paid_social','paid_other','organic_search','organic_social','email','referral','direct')),
  add column if not exists source_paid     boolean,
  add column if not exists utm_source      text check (char_length(utm_source)   <= 150),
  add column if not exists utm_medium      text check (char_length(utm_medium)   <= 150),
  add column if not exists utm_campaign    text check (char_length(utm_campaign) <= 150),
  add column if not exists utm_content     text check (char_length(utm_content)  <= 150),
  add column if not exists utm_term        text check (char_length(utm_term)     <= 150),
  add column if not exists referrer_domain text check (char_length(referrer_domain) <= 253),
  add column if not exists landing_page    text check (char_length(landing_page)    <= 300),
  add column if not exists source_seen_at  timestamptz;

-- Same as 14_atomic_lead_submit.sql, plus the source columns.
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
    current_city, current_state, current_country,
    source_channel, source_paid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer_domain, landing_page, source_seen_at
  )
  select
    r.site, r.full_name, r.phone, r.email, r.preferred_contact, r.county, r.notes,
    r.consent, r.consent_text, r.outcome, r.outcome_reason,
    r.charge_name, r.charge_nrs, r.charge_category,
    r.conviction_date, r.completion_date, r.eligible_date, r.wait_years,
    coalesce(r.answers, '{}'::jsonb), r.page_url, r.user_agent,
    r.current_city, r.current_state, r.current_country,
    r.source_channel, r.source_paid, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term,
    r.referrer_domain, r.landing_page, r.source_seen_at
  from jsonb_populate_record(null::public.leads, p_lead) as r;

  if p_key_hash is not null then
    insert into public.lead_rate_limits (key_hash) values (p_key_hash);
  end if;

  return 'ok';
end;
$$;

revoke all on function public.lead_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_submit(text, jsonb) to service_role;

-- Paid vs organic at a glance: Table Editor → lead_sources_by_month.
-- Lead counts per month, by channel and campaign (no personal details).
create or replace view public.lead_sources_by_month
with (security_invoker = true) as
select
  date_trunc('month', created_at at time zone 'America/Los_Angeles')::date as month,
  case when source_paid then 'Paid' when source_paid = false then 'Organic' else 'Unknown' end as paid_or_organic,
  coalesce(source_channel, 'unknown') as channel,
  coalesce(utm_source, referrer_domain, '') as source,
  coalesce(utm_campaign, '') as campaign,
  count(*) as leads
from public.leads
group by 1, 2, 3, 4, 5
order by 1 desc, 6 desc;

revoke all on public.lead_sources_by_month from anon, authenticated;
