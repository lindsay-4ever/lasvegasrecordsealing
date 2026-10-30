-- ============================================================================
-- Lead numbers: every lead gets an internal number, 1, 2, 3, ... in the order
-- leads came in. New leads get the next number automatically.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. No leads are removed; existing leads are
-- numbered oldest first.
-- ============================================================================
-- Notes
-- • The number is for staff only. The website can't set or change it, and
--   visitors never see it.
-- • A number can occasionally be skipped (if a save fails partway, its number
--   is used up). That's normal and harmless: numbers stay unique and in order.
-- • Postgres adds new columns at the end of the table. Moving it to the front
--   would mean rebuilding the table, which deletes the new-lead email webhook,
--   so it goes at the end. The upcoming_eligibility list shows it too.
-- • If you want real leads to start at 1, delete your test leads in
--   Table Editor BEFORE running this.
-- ============================================================================

alter table public.leads add column if not exists lead_number bigint;

do $$
declare
  next_no bigint;
begin
  -- Only the first run numbers existing leads and switches on auto-numbering
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'lead_number' and is_identity = 'YES'
  ) then
    return;
  end if;

  -- Existing leads: 1, 2, 3, ... oldest first
  update public.leads l
     set lead_number = o.rn
    from (select id, row_number() over (order by created_at, id) as rn
            from public.leads) o
   where l.id = o.id;

  select coalesce(max(lead_number), 0) + 1 into next_no from public.leads;

  alter table public.leads alter column lead_number set not null;
  execute format(
    'alter table public.leads alter column lead_number
       add generated always as identity (start with %s)', next_no);
  alter table public.leads add constraint leads_lead_number_key unique (lead_number);
end $$;

-- Show the number on the reminder list (new columns can only go at the end)
create or replace view public.upcoming_eligibility
with (security_invoker = true) as
select
  l.eligible_date,
  l.eligible_date - (now() at time zone 'America/Los_Angeles')::date as days_until_eligible,
  l.eligibility_reminder,
  l.full_name,
  l.preferred_contact,
  l.phone,
  l.email,
  l.status,
  l.staff_notes,
  l.charge_name,
  l.charge_category,
  l.county,
  l.current_city,
  l.current_state,
  l.created_at_pacific as submitted_pacific,
  l.id,
  l.lead_number
from public.leads l
where l.eligibility_reminder
  and l.eligible_date is not null
  and l.eligible_date <= (now() at time zone 'America/Los_Angeles')::date + 60
  and (
        l.eligible_date >= (now() at time zone 'America/Los_Angeles')::date
     or l.status = 'new'          -- date already passed and nobody has reached out yet
  )
  and l.status not in ('retained', 'not_eligible', 'closed')
order by l.eligible_date;

revoke all on public.upcoming_eligibility from anon, authenticated;

-- Check: newest leads with their numbers
select lead_number, created_at_pacific, full_name
from public.leads
order by lead_number desc
limit 5;
