-- A confirmed citizen report becomes a row in the illegal-dump register.
--
-- Until now app.deponija_* was written by `import:deponije` alone, so the
-- register stops at the last CSV harvest. Recurrence at a spot -- the only
-- signal that turns a site into a black spot -- was therefore measured over data
-- that ends in 2024, while the reports that observe the same ground went
-- nowhere. `deponija_opservacija.tip_dogadjaja` has listed 'prijava' as a value
-- since the table was created; this is the path that finally produces one.

alter table app.deponija_opservacija
  add column prijava_id uuid references app.prijava(id);

-- One observation per report and event type: re-triaging the same report
-- updates its row rather than adding a second one. 'prijava' and 'sanacija' are
-- two different events about the same report, so the type belongs in the key.
create unique index deponija_opservacija_prijava_idx
  on app.deponija_opservacija (prijava_id, tip_dogadjaja)
  where prijava_id is not null;

-- Identity for the canonical sites a report opens. 'K-nn' comes from the CSV and
-- the import owns it -- sharing the namespace would mean the next import upserts
-- over a row that was never in a CSV. A sequence rather than a count, so two
-- concurrent confirmations cannot be handed the same identifier.
create sequence app.deponija_prijava_seq;

-- Why a count of reports may never be added to a count of registry entries.
-- Migration rather than seed.sql alone: the hosted database is never re-seeded,
-- and a comparability group that exists only locally protects nothing.
insert into app.izvorna_serija (izvor, godina_od, godina_do, grupa_uporedivosti, napomena)
select 'PRIJAVA', 2026, 2026, 'prijave-sistem',
       'Citizen reports through this system. The count grows with app adoption, not with dump formation, and is never comparable with registry counts.'
where not exists (
  select 1 from app.izvorna_serija s where s.grupa_uporedivosti = 'prijave-sistem'
);
