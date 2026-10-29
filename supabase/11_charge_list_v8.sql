-- ============================================================================
-- Charge list v8: replace the special-case charges and their staff notes.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once. Existing leads keep their old flag and note.
-- (Supabase may warn about a "destructive operation" because of the delete
--  line below. It only clears this lookup table, not any leads. Safe to confirm.)
-- ============================================================================
-- What changed:
-- 1. The website's charge list now follows the v8 charge sheet (311 charges).
--    The old special-case names no longer exist, so the table is rebuilt.
-- 2. Some charges are special cases only if the offense happened before a
--    certain date (the law changed then). The form now asks when the offense
--    happened for those charges. The trigger flags a lead as a special case
--    only when the form actually treated it as one
--    (outcome_reason = 'special_case'), so later offenses aren't flagged.
-- ============================================================================

-- AI Answer — Attorney Stover should revise: these staff notes are column K
-- ("Special Case Details") of the v8 charge sheet, drafted from the statutes
-- and Ken's answers. Visitors never see them. Edit any time in
-- Table Editor → charge_special_cases.

begin;

delete from public.charge_special_cases;

insert into public.charge_special_cases (charge_name, staff_note) values
  ('Statutory Sexual Seduction — Felony (Offender 21+, Victim 14–15)',
   'Law changed October 1, 2015 (AB 49): before then it was Category C, and the age rules differed. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2015 Statutes of Nevada: AB 49, ch. 399, sec. 27 — applies to offenses committed on or after October 1, 2015.)'),
  ('Statutory Sexual Seduction — Gross Misdemeanor (Offender 18–20, Victim 14–15, No Prior Sexual Offense)',
   'Law changed October 1, 2015 (AB 49): the age rules were different before then. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2015 Statutes of Nevada: AB 49, ch. 399, sec. 27 — applies to offenses committed on or after October 1, 2015.)'),
  ('Statutory Sexual Seduction — Felony (Offender 18–20 With a Prior Sexual Offense)',
   'Law changed October 1, 2015 (AB 49): this felony tier did not exist before then (it was a gross misdemeanor, which can be sealed). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2015 Statutes of Nevada: AB 49, ch. 399, sec. 27 — applies to offenses committed on or after October 1, 2015.)'),
  ('Open or Gross Lewdness — Felony (In Front of a Child or Vulnerable Person, or After a Prior Sexual Offense)',
   'Law changed October 1, 2015 (AB 49): before then this was a gross misdemeanor, which can be sealed. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2015 Statutes of Nevada: AB 49, ch. 399, sec. 27 — applies to offenses committed on or after October 1, 2015.)'),
  ('Indecent Exposure — Felony (In Front of a Child or Vulnerable Person, or After a Prior Sexual Offense)',
   'Law changed October 1, 2015 (AB 49): before then this was a gross misdemeanor, which can be sealed. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2015 Statutes of Nevada: AB 49, ch. 399, sec. 27 — applies to offenses committed on or after October 1, 2015.)'),
  ('High-Level Drug Trafficking — 400 Grams or More (Schedule I/II, Not Marijuana)',
   'Law changed July 1, 2020 (AB 236): before then, trafficking tiers started at 4 grams, and 28 grams or more of a Schedule I substance was a Category A felony (10 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada, AB 236.)'),
  ('Burglary (Offense Committed Before July 1, 2020)',
   'Offense date matters. Before July 1, 2020, burglary was generally Category B, and the sealing law then in effect gave 10 years to any burglary. Current law gives 10 years to residential burglary and 5 years to other burglary (Ken answered 10 years for business burglary). Attorney reviews the court record (offense date and whether a home was entered) to set the wait.'),
  ('Grand Larceny — $3,500 or More (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Grand Larceny — $650 to $3,499 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Grand Larceny (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Embezzlement — $3,500 or More (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Embezzlement — $650 to $3,499 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Embezzlement — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Embezzlement (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Low-Level Drug Trafficking — 100 to Under 400 Grams (Schedule I/II, Not Marijuana)',
   'Law changed July 1, 2020 (AB 236): before then, trafficking tiers started at 4 grams, and 28 grams or more of a Schedule I substance was a Category A felony (10 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada, AB 236.)'),
  ('Coercion — Without Physical Force or Immediate Threat of Physical Force',
   'Ask about the facts: Yes if force or violence against the victim, or a firearm or deadly weapon, was threatened (NRS 202.876 item 16); otherwise No. If yes: 10 years. If no: 1 year.'),
  ('Domestic Battery — Pregnant Victim, First Offense (Gross Misdemeanor)',
   'Law changed July 1, 2019 (AB 60): this tier did not exist before then. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('Domestic Battery — Pregnant Victim, Second or Subsequent Offense (Felony)',
   'Ask about the facts: Yes if committed by strangulation or substantial bodily harm resulted (NRS 202.876 item 11); otherwise No. If yes: 10 years. If no: 5 years. Also: law changed July 1, 2019 (AB 60): this tier did not exist before then. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('Receiving / Possessing Stolen Property — $3,500 or More or a Firearm (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Receiving / Possessing Stolen Property — $650 to $3,499 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Receiving / Possessing Stolen Property — Under $650, Not a Firearm (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Receiving / Possessing Stolen Property (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Stalking a Child Under 16 (Offender 5+ Years Older) — First Offense',
   'Law changed July 1, 2019 (AB 60): before then this was charged as ordinary stalking. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('Stalking a Child Under 16 (Offender 5+ Years Older) — Second Offense',
   'Law changed July 1, 2019 (AB 60): before then this was charged as ordinary stalking. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('Stalking a Child Under 16 (Offender 5+ Years Older) — Third or Subsequent Offense',
   'Law changed July 1, 2019 (AB 60): before then this was charged as ordinary stalking. If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('Domestic Battery — Third Offense Within 7 Years (Felony)',
   'Ask about the facts: Yes if committed by strangulation or substantial bodily harm resulted (NRS 202.876 item 11); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Domestic Battery — After a Prior Felony Domestic Violence Conviction or Prior Domestic Battery With a Deadly Weapon',
   'Ask about the facts: Yes if committed by strangulation or substantial bodily harm resulted (NRS 202.876 item 11); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Battery by a Probationer, Prisoner or Parolee — No Deadly Weapon',
   'Ask about the facts: Yes if substantial bodily harm or strangulation (NRS 202.876 item 11); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('False Imprisonment — With a Deadly Weapon, by a Prisoner, to Avoid Arrest, or Using the Victim as a Shield (Adult Victim or Own Child)',
   'Ask about the facts: Yes if force, violence, a firearm or a deadly weapon was used or threatened (NRS 202.876 item 9); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Violation of Extended Domestic Violence Protective Order — Third or Subsequent Violation',
   'Law changed July 1, 2019 (AB 19): before then every violation was a misdemeanor (2 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 19, ch. 477, effective July 1, 2019.)'),
  ('Violation of Extended Domestic Violence Protective Order — Second Violation',
   'Law changed July 1, 2019 (AB 19): before then every violation was a misdemeanor (2 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 19, ch. 477, effective July 1, 2019.)'),
  ('Obtaining Money by False Pretenses — $650 or More (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Obtaining Money by False Pretenses (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Bad Check — $650 or More (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Bad Check (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Conspiracy to Commit Sex Trafficking of a Child',
   'Attorney decides whether this conspiracy counts as a crime against a child (NRS 179D.0357(4)). If it does, it cannot be sealed; if not, 5 years under Ken''s conspiracy answer.'),
  ('Possession of a Controlled Substance — Second Offense, Only 1 Prior Drug Conviction (Under 14 Grams Schedule I/II or Under 28 Grams Schedule III–V)',
   'Law changed July 1, 2020 (AB 236): before then, a second offense involving a Schedule V substance was a Category D felony (5 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 236, ch. 633, sec. 137 — effective July 1, 2020.)'),
  ('Low-Level Possession of a Controlled Substance (14 to Under 28 Grams Schedule I/II, or 28 to Under 200 Grams Schedule III–V)',
   'Law changed July 1, 2020 (AB 236): before then possession tiers were different (often Category E, 2 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 236, ch. 633, sec. 137 — effective July 1, 2020.)'),
  ('Mid-Level Possession of a Controlled Substance (28 to Under 42 Grams Schedule I/II, or 200 Grams or More Schedule III–V)',
   'Law changed July 1, 2020 (AB 236): before then possession tiers were different (often Category E, 2 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 236, ch. 633, sec. 137 — effective July 1, 2020.)'),
  ('Possession of Flunitrazepam or GHB',
   'Attorney confirms whether the 3-year route in NRS 453.3365(1) applies to this offense (NRS 453.336(3)); if not, 5 years.'),
  ('Petit Larceny — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Petit Larceny (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('False Imprisonment — Gross Misdemeanor (Adult Victim or Own Child)',
   'Ask about the facts: Yes if force, violence, a firearm or a deadly weapon was used or threatened (NRS 202.876 item 9); otherwise No. If yes: 10 years. If no: 2 years.'),
  ('Shoplifting / Retail Theft — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Shoplifting / Retail Theft (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Obtaining Money by False Pretenses — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Bad Check — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Assault on a Protected Person by a Probationer, Prisoner or Parolee (Felony)',
   'Ask about the facts: Yes if a deadly weapon was used (NRS 202.876 item 10); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Stalking — Third or Subsequent Offense (Felony)',
   'Law changed July 1, 2019 (AB 60): before then a third offense was a gross misdemeanor (2 years). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 60, ch. 308, effective July 1, 2019.)'),
  ('DUI — After a Prior Felony DUI (Felony)',
   'NRS 179.245(6) does not list NRS 484C.410, so by statute this is sealable after 5 years (Category B). Ken to confirm whether to treat it as not sealable like other felony DUIs.'),
  ('Under the Influence of Controlled Substance',
   'Law changed July 1, 2020 (AB 236): before then it was a Category E felony, or a gross misdemeanor for a Schedule V substance (2 years either way). If the offense was earlier, the attorney sets the class and wait from the law in effect then. (Checked against the 2019 Statutes of Nevada: AB 236, ch. 633, sec. 137 — effective July 1, 2020.)'),
  ('Possession of Marijuana — 1 Ounce or Less',
   'Law changed October 1, 2021 (AB 158, 2021): before then a third offense was a gross misdemeanor and a fourth or later offense a Category E felony (2 years either way), and the no-hearing sealing now in NRS 453.336(8) did not exist. The new rules apply to offenses committed on or after October 1, 2021 and to earlier offenses sentenced on or after that date. If sentenced earlier, the attorney sets the class and wait from the law in effect then.'),
  ('Theft (Including Theft of Services) — Under $650 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Theft (Including Theft of Services) — $650 to $3,499 (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Theft (Including Theft of Services) — $3,500 or More (Offense Committed October 1, 2011 – June 30, 2020)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Theft (Including Theft of Services) (Offense Committed Before October 1, 2011)',
   'Offense date matters: tiers and thresholds were different then. Attorney reviews the court record (amount and offense date) to set the class and wait.'),
  ('Attempt to Commit a Category A Felony (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Attempt to Commit a Category B Felony (Maximum Over 10 Years) (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Attempt to Commit a Category B Felony (Maximum 10 Years or Less) (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Attempt to Commit a Category C Felony — Convicted as a Felony (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 5 years.'),
  ('Attempt to Commit a Category C Felony — Convicted as a Gross Misdemeanor (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 2 years.'),
  ('Attempt to Commit a Category D Felony (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 2 years.'),
  ('Attempt to Commit a Category E Felony (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17); otherwise No. If yes: 10 years. If no: 2 years.'),
  ('Attempt to Commit a Misdemeanor or Gross Misdemeanor (Not a Sexual Offense or Crime Against a Child)',
   'Ask about the facts: Yes if the offense attempted is on the NRS 202.876 list (item 17), such as false imprisonment with force or a weapon; otherwise No. If yes: 10 years. If no: 1 year. An attempted gross misdemeanor carries at most about 182 days and $1,000 (NRS 193.153(1)(b)), which fits the misdemeanor definition (NRS 193.120(3)); attorney confirms (2 years if treated as a gross misdemeanor). If the offense attempted was battery, harassment, stalking or a protective-order violation, attorney confirms whether the 2-year rule in NRS 179.245(1)(f) applies.');

create or replace function public.leads_set_special_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  note text;
begin
  select staff_note into note
  from public.charge_special_cases
  where charge_name = new.charge_name;

  new.special_case      := note is not null and new.outcome_reason = 'special_case';
  new.special_case_note := case when new.special_case then note end;
  return new;
end;
$$;

revoke all on function public.leads_set_special_case() from public, anon, authenticated;

commit;

-- Check: should return 64
-- select count(*) from public.charge_special_cases;
