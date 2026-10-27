-- Where the person lives now (separate from the county their case was in).
-- Run once in Supabase → SQL Editor BEFORE the form update goes live,
-- otherwise new submissions will be rejected.

alter table public.leads
  add column if not exists current_city    text check (char_length(current_city) <= 100),
  add column if not exists current_state   text check (char_length(current_state) <= 40),   -- 'Outside the U.S.' for international
  add column if not exists current_country text check (char_length(current_country) <= 60); -- 'United States' for U.S. visitors

-- Let the website fill in these three columns (still insert-only, no reading)
grant insert (current_city, current_state, current_country) on public.leads to anon;
