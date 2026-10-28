-- ============================================================================
-- Eligibility reminders for people who aren't eligible yet.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. No leads are removed or changed except that
-- existing "waiting" leads get eligibility_reminder = true.
-- ============================================================================
-- 1. leads.eligibility_reminder (yes/no)
--    Set to TRUE automatically for every lead whose result was "waiting"
--    (not eligible yet, with an eligible_date). The form has no opt-in
--    checkbox. Submitting the form with contact info is the request to be
--    contacted. Staff can untick it in Table Editor if someone asks not to
--    be reminded.
--
-- 2. upcoming_eligibility (a saved list, under Table Editor → Views)
--    Everyone with a reminder whose eligible date falls within the next
--    60 days, soonest first. It also keeps anyone whose date has already
--    passed but who is still marked "new", so nobody slips through.
--    Once staff change the lead's status (e.g. to "contacted"), the person
--    drops off the list.
-- ============================================================================

-- Postgres adds new columns at the end of the table. Rebuilding the table to
-- place it beside eligible_date would also delete any Database Webhook on
-- leads (the new-lead email alert), so the column goes at the end instead.
-- The upcoming_eligibility list shows the two side by side.
alter table public.leads
  add column if not exists eligibility_reminder boolean not null default false;

-- Existing leads: turn the reminder on for everyone already waiting
update public.leads
set eligibility_reminder = true
where outcome = 'waiting' and eligible_date is not null and not eligibility_reminder;

-- New leads: set it automatically. The website can't set this column
-- itself (it isn't in the website's insert permissions).
create or replace function public.leads_set_eligibility_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.eligibility_reminder := (new.outcome = 'waiting' and new.eligible_date is not null);
  return new;
end;
$$;

revoke all on function public.leads_set_eligibility_reminder() from public, anon, authenticated;

drop trigger if exists leads_eligibility_reminder_trg on public.leads;
create trigger leads_eligibility_reminder_trg
  before insert on public.leads
  for each row execute function public.leads_set_eligibility_reminder();

create index if not exists leads_eligible_date_idx
  on public.leads (eligible_date) where eligibility_reminder;

-- The list the team checks each month
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
  l.id
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

-- Staff-only: the website can never read this list
revoke all on public.upcoming_eligibility from anon, authenticated;
