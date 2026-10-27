-- Removes the three charges that are no longer special cases, per Ken:
--   Indecent Exposure — First Offense      → now 2 years (gross misdemeanor)
--   Conspiracy — General                   → split into Cat B felony (5 yrs) + gross misdemeanor (2 yrs)
--   Open or Gross Lewdness — First Offense → split into gross misdemeanor (2 yrs) + felony (cannot be sealed)
-- Replaces running 03, 04 and 05 separately. Safe to run more than once.
-- Afterward, charge_special_cases should list only Administering Controlled
-- Substance and Pandering.

delete from public.charge_special_cases
where charge_name in (
  'Indecent Exposure — First Offense',
  'Conspiracy — General (Felony Underlying Offense)',
  'Open or Gross Lewdness — First Offense'
);
