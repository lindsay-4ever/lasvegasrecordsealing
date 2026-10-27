-- ============================================================================
-- Special-case charges: flag them on each lead + give staff a note on what to ask
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- (Supabase may warn about "destructive operations" because of the
--  drop ... if exists lines — safe to confirm; no data is removed.)
-- ============================================================================
-- How it works: when a lead is saved, the database looks up the charge in
-- charge_special_cases. If it's there, the lead gets special_case = true and
-- the staff note is copied onto it. Visitors never see these notes — they
-- live only in the database, not in the website's code.
-- ============================================================================

alter table public.leads
  add column if not exists special_case      boolean not null default false,
  add column if not exists special_case_note text;

create index if not exists leads_special_case_idx on public.leads (special_case) where special_case;

-- Lookup table of special-case charges (staff-only; the website can't read it)
create table if not exists public.charge_special_cases (
  charge_name text primary key,       -- must match the charge name in the form exactly
  staff_note  text not null
);
alter table public.charge_special_cases enable row level security;
revoke all on public.charge_special_cases from anon, authenticated;

-- AI Answer — Attorney Stover should revise: staff notes below were drafted
-- from Ken's column H answers and the statutes. Edit them any time in
-- Table Editor → charge_special_cases.
insert into public.charge_special_cases (charge_name, staff_note) values
  ('Administering Controlled Substance / Intoxicant to Aid a Crime of Violence',
   'Ask what the underlying crime was. Felony sex offense → cannot be sealed. Anything else → sealable (Ken to confirm wait period; likely 10 years).'),
  ('Open or Gross Lewdness — First Offense',
   'Ask: was a child under 18 or a vulnerable person present, or any prior sex-offense conviction? If yes → felony → cannot be sealed. If no → gross misdemeanor → 2 years.'),
  ('Pandering / Living from Earnings of a Prostitute (Adult Victim)',
   'Confirm the victim''s age. Adult → 10 years. Child → cannot be sealed.')
on conflict (charge_name) do update set staff_note = excluded.staff_note;

-- Trigger: set the flag + note on every new lead
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

  new.special_case      := note is not null;
  new.special_case_note := note;
  return new;
end;
$$;

revoke all on function public.leads_set_special_case() from public, anon, authenticated;

drop trigger if exists leads_special_case_trg on public.leads;
create trigger leads_special_case_trg
  before insert on public.leads
  for each row execute function public.leads_set_special_case();
