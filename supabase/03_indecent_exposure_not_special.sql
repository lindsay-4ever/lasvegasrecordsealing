-- Indecent Exposure — First Offense is no longer a special case:
-- per Ken, gross misdemeanor = sealable after 2 years; felony = cannot be sealed.
-- Run once in Supabase → SQL Editor. (Existing leads keep their old flag.)
delete from public.charge_special_cases
where charge_name = 'Indecent Exposure — First Offense';
