-- Open or Gross Lewdness — First Offense is no longer a special case: the
-- charge list now has a gross misdemeanor row (2 years) and a Cat D felony
-- row (cannot be sealed), per Ken.
-- Run once in Supabase → SQL Editor. (Existing leads keep their old flag.)
delete from public.charge_special_cases
where charge_name = 'Open or Gross Lewdness — First Offense';
