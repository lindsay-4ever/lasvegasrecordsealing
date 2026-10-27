-- ============================================================================
-- Las Vegas Record Sealing — leads table
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- ============================================================================
-- Security model:
--   * The website (anonymous visitors) can ONLY insert new leads.
--   * Nobody can read, edit or delete leads from the browser — not even with
--     the public key that sits in the page source.
--   * You view and manage leads in the Supabase dashboard (Table Editor),
--     which uses your logged-in admin account and bypasses these rules.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- which site sent it (ready for nevadasealingrecords.com later)
  site             text not null default 'lasvegasrecordsealing'
                   check (site in ('lasvegasrecordsealing', 'nevadasealingrecords')),

  -- office workflow (edit this in the dashboard as you follow up)
  status           text not null default 'new'
                   check (status in ('new','contacted','qualified','retained','not_eligible','closed')),
  staff_notes      text,

  -- contact details
  full_name        text not null check (char_length(full_name) between 1 and 200),
  phone            text not null check (char_length(phone) between 7 and 40),
  email            text not null check (char_length(email) <= 254
                                        and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  preferred_contact text not null check (preferred_contact in ('phone','text','email')),
  county           text check (char_length(county) <= 40),
  notes            text check (char_length(notes) <= 5000),

  -- consent (form cannot submit without it)
  consent          boolean not null check (consent = true),
  consent_text     text check (char_length(consent_text) <= 1000),

  -- what the eligibility check concluded
  outcome          text check (char_length(outcome) <= 40),        -- packet / waiting / contact
  outcome_reason   text check (char_length(outcome_reason) <= 40),
  charge_name      text check (char_length(charge_name) <= 300),
  charge_nrs       text check (char_length(charge_nrs) <= 200),
  charge_category  text check (char_length(charge_category) <= 60),
  conviction_date  text check (char_length(conviction_date) <= 10), -- YYYY-MM (approximate)
  completion_date  date,
  eligible_date    date,
  wait_years       int  check (wait_years between 0 and 50),

  -- every raw answer, so nothing from the form is ever lost
  answers          jsonb not null default '{}'::jsonb
                   check (pg_column_size(answers) < 20000),

  page_url         text check (char_length(page_url) <= 500),
  user_agent       text check (char_length(user_agent) <= 500)
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx     on public.leads (status);

-- ---------------------------------------------------------------------------
-- Row Level Security: insert-only for the public website
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;

-- Visitors may fill in only these columns. They cannot set id, created_at,
-- status or staff_notes, and cannot read anything back.
grant insert (
  site, full_name, phone, email, preferred_contact, county, notes,
  consent, consent_text, outcome, outcome_reason,
  charge_name, charge_nrs, charge_category,
  conviction_date, completion_date, eligible_date, wait_years,
  answers, page_url, user_agent
) on public.leads to anon;

drop policy if exists "Website can submit leads" on public.leads;
create policy "Website can submit leads"
  on public.leads
  for insert
  to anon
  with check (consent = true);

-- No select / update / delete policies on purpose.
