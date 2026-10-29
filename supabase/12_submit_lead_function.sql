-- ============================================================================
-- Spam protection, part 1: rate limit for the submit-lead function.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. Does not change any leads.
-- ============================================================================
-- The submit-lead Edge Function calls lead_rate_ok() before saving a lead.
-- It allows at most 5 submissions per hour and 20 per day from the same
-- connection. Only a scrambled (hashed) form of the IP address is stored, and
-- entries older than 2 days are deleted automatically.
-- Neither the website nor visitors can read or call any of this; only the
-- function (using the server's own key) can.
-- ============================================================================

create table if not exists public.lead_rate_limits (
  id         bigint generated always as identity primary key,
  key_hash   text not null check (char_length(key_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists lead_rate_limits_key_idx on public.lead_rate_limits (key_hash, created_at);

alter table public.lead_rate_limits enable row level security;
revoke all on public.lead_rate_limits from anon, authenticated;

create or replace function public.lead_rate_ok(p_key_hash text)
returns boolean
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
  delete from public.lead_rate_limits where created_at < now() - interval '2 days';

  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*)
    into n_hour, n_day
    from public.lead_rate_limits
   where key_hash = p_key_hash
     and created_at > now() - interval '1 day';

  if n_hour >= per_hour or n_day >= per_day then
    return false;
  end if;

  insert into public.lead_rate_limits (key_hash) values (p_key_hash);
  return true;
end;
$$;

revoke all on function public.lead_rate_ok(text) from public, anon, authenticated;
grant execute on function public.lead_rate_ok(text) to service_role;
