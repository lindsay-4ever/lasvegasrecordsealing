-- Conspiracy is no longer a special case: the charge list now has two rows,
-- "Conspiracy — Category B Felony (...)" (5 years) and
-- "Conspiracy — Gross Misdemeanor" (2 years), per Ken.
-- Run once in Supabase → SQL Editor. (Existing leads keep their old flag.)
delete from public.charge_special_cases
where charge_name = 'Conspiracy — General (Felony Underlying Offense)';
