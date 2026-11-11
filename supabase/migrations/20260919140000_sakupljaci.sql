-- Collectors of secondary raw materials (sakupljači sekundarnih sirovina): the
-- people who take what JKP containers do not — scrap metal, e-waste, particle
-- board, rubble. When a citizen asks "where does this go" and no site on the
-- map fits, one of these is the answer, and without one the old wardrobe ends
-- up beside the road.
--
-- Deliberately NOT a row in app.korisnik. A korisnik signs in with email and
-- password to act inside the system; a collector never signs in — they are a
-- contact the system hands out. Folding them into korisnik would mean inventing
-- credentials for people who will never use them.

-- One vocabulary for what a citizen wants to get rid of and what a collector
-- (or, later, a drop-off site) accepts; each states its own list, so matching
-- is a data question. Not app.tip_otpada: that enum describes container
-- streams (komunalni, suvi_reciklabilni...), a different question.
create type app.materijal_otpada as enum (
  'staklo', 'plastika', 'papir', 'kabasti', 'elektronski', 'baterije', 'gume', 'zeleni',
  'metal', 'iverica', 'drvo', 'tekstil', 'gradjevinski'
);

create table app.sakupljac (
  id            uuid primary key default gen_random_uuid(),
  ime           text not null,
  prezime       text not null,
  -- PUBLIC BY DESIGN, unlike gradjanin.telefon_e164: showing this number to any
  -- citizen who searches is the entire purpose of the row. That is why only an
  -- administrator can add one (docs/disposal-search.md) — a self-service form
  -- would let anyone publish a stranger's phone number.
  telefon_e164  text not null unique,
  -- What they take. Not personal data, but without it "who handles metal" has
  -- no answer; it is the one column beyond name and phone the feature needs.
  materijali    app.materijal_otpada[] not null,
  kreiran_at    timestamptz not null default now(),

  constraint sakupljac_ime_valid check (length(btrim(ime)) between 1 and 80),
  constraint sakupljac_prezime_valid check (length(btrim(prezime)) between 1 and 80),
  -- Serbian numbers only, stored as E.164: +381, then a mobile (6x...) or a
  -- landline (10 = Pirot...) number. The API normalises "064 123 4567" and
  -- "00381..." before it gets here; this is the backstop.
  constraint sakupljac_telefon_valid check (telefon_e164 ~ '^\+381[1-9][0-9]{7,8}$'),
  constraint sakupljac_materijali_valid check (cardinality(materijali) > 0)
);

-- "Who takes metal" is `materijali @> array['metal']`: containment, which is
-- what a GIN index serves (`= any(...)` would scan).
create index sakupljac_materijali_idx on app.sakupljac using gin (materijali);

comment on table app.sakupljac is
  'Collectors of materials JKP does not take. Phone numbers are public by design; rows are added by administrators only.';

-- Same lockdown as every other table in this schema (20260918120800_lockdown).
alter table app.sakupljac enable row level security;
revoke all on app.sakupljac from anon, authenticated, service_role;
