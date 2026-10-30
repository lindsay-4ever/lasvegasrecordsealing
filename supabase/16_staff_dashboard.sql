-- ============================================================================
-- Staff dashboard (lasvegasrecordsealing.com/staff): who can see leads.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. No leads are removed or changed.
-- ============================================================================
-- How access works
-- • A person can see leads only if ALL of these are true:
--     1. they signed in with an account you created (public sign-ups are off
--        in Authentication settings),
--     2. they entered the 6-digit code from their authenticator app, and
--     3. their email is on the staff list (public.staff_members).
--   The database checks this itself on every request, so the dashboard
--   page being public doesn't matter.
-- • Staff can change only: status, staff_notes, eligibility_reminder.
--   They can't edit what the person entered, add leads or delete leads.
-- • Every change records who made it and when (updated_by, updated_at).
-- • The website form is unaffected; it still saves leads through the
--   submit-lead function only.
-- ============================================================================

-- 1. The staff list ----------------------------------------------------------
create table if not exists public.staff_members (
  email     text primary key
            check (email = lower(btrim(email)) and email like '%_@_%'),
  name      text,
  added_at  timestamptz not null default now()
);

alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;   -- nobody reads it directly

-- 2. "Is the signed-in person staff?" ----------------------------------------
-- True only for a staff-list email that has passed the 6-digit code (aal2).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
           select 1 from public.staff_members s
            where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
         );
$$;

revoke all on function public.is_staff() from public, anon, authenticated;
grant execute on function public.is_staff() to authenticated;

-- 3. Record who last changed a lead -----------------------------------------
-- New columns go at the end of the table (rebuilding it would delete the
-- new-lead email webhook).
alter table public.leads add column if not exists updated_at timestamptz;
alter table public.leads add column if not exists updated_by text;

create or replace function public.leads_track_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status, new.staff_notes, new.eligibility_reminder)
     is distinct from (old.status, old.staff_notes, old.eligibility_reminder) then
    new.updated_at := now();
    new.updated_by := coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), 'Supabase dashboard');
  end if;
  return new;
end;
$$;

revoke all on function public.leads_track_update() from public, anon, authenticated;

drop trigger if exists leads_track_update_trg on public.leads;
create trigger leads_track_update_trg
  before update on public.leads
  for each row execute function public.leads_track_update();

-- 4. What staff can do with leads --------------------------------------------
grant select on public.leads to authenticated;
revoke update on public.leads from authenticated;
grant update (status, staff_notes, eligibility_reminder) on public.leads to authenticated;

drop policy if exists "Staff can read leads" on public.leads;
create policy "Staff can read leads"
  on public.leads for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "Staff can update lead status and notes" on public.leads;
create policy "Staff can update lead status and notes"
  on public.leads for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Visitors to the website (anon) still get nothing.
revoke all on public.leads from anon;

-- 5. Next: add the three login emails to the staff list ----------------------
-- Table Editor → staff_members → Insert → Insert row, one row per person
-- (email in lowercase). Or run, with the real emails:
--   insert into public.staff_members (email, name) values
--     ('name@example.com', 'Name');
-- ============================================================================
