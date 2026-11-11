-- Real drop-off sites for waste that does not go into the street container —
-- what the citizen map ("Gde da odložim") shows and the disposal search matches.
--
-- Until now the map was a hand-written demo list in the frontend. These rows are
-- real, and each cites where it came from (`izvor` is required): nothing goes on
-- a citizen map without a source, because a pin sends a person somewhere.
--
-- The search matches on `materijali`, not on `tip`: a scrap buyer is one type of
-- site but takes metal AND car batteries.

create type app.tip_mesta_odlaganja as enum ('deponija', 'otkup_sirovina', 'reciklazno_dvoriste');

create table app.mesto_odlaganja (
  id             uuid primary key default gen_random_uuid(),
  naziv          text not null,
  tip            app.tip_mesta_odlaganja not null,
  adresa         text not null,
  lokacija       extensions.geography(Point,4326) not null,
  -- Same honesty flag as the dump tables: a geocoded street is not a surveyed
  -- gate, and the UI has to be able to say "približno".
  geo_preciznost app.geo_preciznost not null,
  radno_vreme    text,
  -- For people: what the site takes, in its own words.
  prima          text[] not null default '{}',
  -- For the search: the same in the shared vocabulary. May be empty (the
  -- landfill takes mixed waste, which is not a material anyone searches for).
  materijali     app.materijal_otpada[] not null default '{}',
  izvor          text not null,

  constraint mesto_odlaganja_naziv_valid check (length(btrim(naziv)) between 2 and 160)
);

create index mesto_odlaganja_materijali_idx on app.mesto_odlaganja using gin (materijali);

alter table app.mesto_odlaganja enable row level security;
revoke all on app.mesto_odlaganja from anon, authenticated, service_role;
