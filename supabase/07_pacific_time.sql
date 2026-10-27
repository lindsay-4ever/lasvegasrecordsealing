-- Adds created_at_pacific: the submission time in Pacific time
-- (America/Los_Angeles — switches between PST and PDT automatically).
-- created_at stays in UTC; this is a read-only copy for easy viewing.
-- Run once in Supabase → SQL Editor. Fills in for existing leads too.

alter table public.leads
  add column if not exists created_at_pacific timestamp
  generated always as (created_at at time zone 'America/Los_Angeles') stored;
