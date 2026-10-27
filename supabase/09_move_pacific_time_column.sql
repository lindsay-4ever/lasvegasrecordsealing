-- ============================================================================
-- Move created_at_pacific next to created_at.
-- Postgres can't reorder columns, so this rebuilds the leads table with the
-- new order and copies every lead across. It runs as ONE transaction: if any
-- step fails, nothing changes. All leads, security rules and the special-case
-- trigger are kept.
-- Run once in Supabase → SQL Editor (confirm the "destructive operation" prompt).
-- ============================================================================
begin;

create table public.leads_new (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  created_at_pacific timestamp generated always as (created_at at time zone 'America/Los_Angeles') stored,

  site               text not null default 'lasvegasrecordsealing'
                     check (site in ('lasvegasrecordsealing', 'nevadasealingrecords')),
  status             text not null default 'new'
                     check (status in ('new','contacted','qualified','retained','not_eligible','closed')),
  staff_notes        text,

  full_name          text not null check (char_length(full_name) between 1 and 200),
  phone              text not null check (char_length(phone) between 7 and 40),
  email              text not null check (char_length(email) <= 254
                                          and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  preferred_contact  text not null check (preferred_contact in ('phone','text','email')),
  county             text check (char_length(county) <= 40),
  notes              text check (char_length(notes) <= 5000),

  consent            boolean not null check (consent = true),
  consent_text       text check (char_length(consent_text) <= 1000),

  outcome            text check (char_length(outcome) <= 40),
  outcome_reason     text check (char_length(outcome_reason) <= 40),
  charge_name        text check (char_length(charge_name) <= 300),
  charge_nrs         text check (char_length(charge_nrs) <= 200),
  charge_category    text check (char_length(charge_category) <= 60),
  conviction_date    text check (char_length(conviction_date) <= 10),
  completion_date    date,
  eligible_date      date,
  wait_years         int  check (wait_years between 0 and 50),

  answers            jsonb not null default '{}'::jsonb check (pg_column_size(answers) < 20000),
  page_url           text check (char_length(page_url) <= 500),
  user_agent         text check (char_length(user_agent) <= 500),

  special_case       boolean not null default false,
  special_case_note  text,

  current_city       text check (char_length(current_city) <= 100),
  current_state      text check (char_length(current_state) <= 40),
  current_country    text check (char_length(current_country) <= 60)
);

-- Copy every lead (created_at_pacific recalculates itself)
insert into public.leads_new (
  id, created_at, site, status, staff_notes, full_name, phone, email, preferred_contact,
  county, notes, consent, consent_text, outcome, outcome_reason, charge_name, charge_nrs,
  charge_category, conviction_date, completion_date, eligible_date, wait_years, answers,
  page_url, user_agent, special_case, special_case_note, current_city, current_state, current_country)
select
  id, created_at, site, status, staff_notes, full_name, phone, email, preferred_contact,
  county, notes, consent, consent_text, outcome, outcome_reason, charge_name, charge_nrs,
  charge_category, conviction_date, completion_date, eligible_date, wait_years, answers,
  page_url, user_agent, special_case, special_case_note, current_city, current_state, current_country
from public.leads;

-- Safety check: stop (and undo everything) if any lead didn't copy
do $$
begin
  if (select count(*) from public.leads_new) <> (select count(*) from public.leads) then
    raise exception 'Row count mismatch — nothing was changed';
  end if;
end $$;

drop table public.leads;                       -- also removes its old trigger/policy/indexes
alter table public.leads_new rename to leads;
alter index public.leads_new_pkey rename to leads_pkey;

create index leads_created_at_idx   on public.leads (created_at desc);
create index leads_status_idx       on public.leads (status);
create index leads_special_case_idx on public.leads (special_case) where special_case;

-- Security: website can only insert, never read/edit/delete
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
grant insert (
  site, full_name, phone, email, preferred_contact, county, notes,
  consent, consent_text, outcome, outcome_reason,
  charge_name, charge_nrs, charge_category,
  conviction_date, completion_date, eligible_date, wait_years,
  answers, page_url, user_agent,
  current_city, current_state, current_country
) on public.leads to anon;

create policy "Website can submit leads"
  on public.leads for insert to anon
  with check (consent = true);

-- Special-case flag + staff note on every new lead
create trigger leads_special_case_trg
  before insert on public.leads
  for each row execute function public.leads_set_special_case();

commit;
