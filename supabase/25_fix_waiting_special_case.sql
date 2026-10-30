-- ============================================================================
-- Fix: some "not eligible yet" leads couldn't be saved.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. Does not change any saved leads.
-- ============================================================================
-- The problem: 11_charge_list_v8.sql flags a lead as a special case when its
-- charge is on the special-case list AND the form's reason is 'special_case'.
-- For "still in the waiting period" results the form sends no reason at all,
-- so for a charge on the list the check came out empty instead of false. The
-- special_case column requires true or false, so the database refused the
-- whole lead and the visitor saw "we couldn't send your information".
-- Charges hit: the 71 special-case charges (for example petit larceny and
-- burglary, whose law changed on a date) when the person is still waiting.
-- The fix: treat a missing reason as "not a special case".
-- ============================================================================

create or replace function public.leads_set_special_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  note text;
begin
  select staff_note into note
  from public.charge_special_cases
  where charge_name = new.charge_name;

  new.special_case      := note is not null and coalesce(new.outcome_reason, '') = 'special_case';
  new.special_case_note := case when new.special_case then note end;
  return new;
end;
$$;

revoke all on function public.leads_set_special_case() from public, anon, authenticated;
