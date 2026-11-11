-- Settlements, collection points, containers, devices.
--
-- `geography(Point,4326)` throughout: distances are wanted in metres and the
-- area is small enough that the projection question never becomes interesting.

create table app.mesna_zajednica (
  id       uuid primary key default gen_random_uuid(),
  naziv    text not null unique,
  opstina  text not null default 'Pirot'
);

create table app.naselje (
  id                         uuid primary key default gen_random_uuid(),
  naziv                      text not null,
  -- SEPA place code (e.g. 732397). The only identifier that survives across the
  -- registry, the LPUO and the citizen-report scrape, so joins key on it.
  sifra_mesta                text unique,
  mesna_zajednica_id         uuid references app.mesna_zajednica(id),
  opstina                    text not null default 'Pirot',
  centroid                   extensions.geography(Point,4326) not null,
  granica                    extensions.geography(Polygon,4326),
  broj_domacinstava          integer,
  -- The strongest single predictor available: the LPUO reaches 31 settlements,
  -- the rest have no organised collection at all, and that is exactly where
  -- dumps appear. Not nullable, because "we did not check" is not an answer a
  -- model may silently receive.
  organizovano_prikupljanje  boolean not null,
  pristup_kamionu            text,
  udaljenost_od_baze_km      numeric(6,2)
);

create index naselje_centroid_idx on app.naselje using gist (centroid);

-- The sources spell one village as 'Sukovo' and 'selo sukovo'. Import resolves
-- through this table; an alias with no match is a review task, never a quietly
-- created second village.
create table app.naselje_alias (
  id          uuid primary key default gen_random_uuid(),
  naselje_id  uuid not null references app.naselje(id) on delete cascade,
  alias       text not null,
  izvor       text not null,
  unique (alias, izvor)
);

create table app.sabirno_mesto (
  id                 uuid primary key default gen_random_uuid(),
  naselje_id         uuid not null references app.naselje(id),
  naziv              text not null,
  lokacija           extensions.geography(Point,4326) not null,
  -- Prioritisation input: shared points serving many households are sensored
  -- first. Individual household bins are out of scope by design.
  broj_domacinstava  integer,
  pristup            text,
  aktivno_od         date not null default current_date,
  aktivno_do         date
);

create index sabirno_mesto_lokacija_idx on app.sabirno_mesto using gist (lokacija);

create table app.kontejner (
  id                uuid primary key default gen_random_uuid(),
  oznaka            text not null unique,   -- the label on the physical unit, e.g. PI-KRU-004
  sabirno_mesto_id  uuid not null references app.sabirno_mesto(id),
  tip_otpada        app.tip_otpada not null,
  zapremina_l       integer not null,
  postavljen_datum  date not null default current_date,
  uklonjen_datum    date,
  status            text not null default 'aktivan'
);

create index kontejner_sabirno_mesto_idx on app.kontejner (sabirno_mesto_id);

create table app.uredjaj (
  id           uuid primary key default gen_random_uuid(),
  dev_eui      text not null unique,
  model        text,
  proizvodjac  text,
  aktiviran    date,
  status       text not null default 'aktivan'
);

-- Answers the open question in docs/sensor-telemetry.md: how a swapped unit
-- keeps the container's history intact. Identity belongs to the container; the
-- device is an attachment with a validity period.
--
-- The configured depth lives HERE and not on kontejner, because fill % is
-- computed on the device from the depth entered on that unit. Correcting a
-- mis-entered depth is: close this row, open a new one, recompute the readings
-- in the affected window from distance_cm.
create table app.uredjaj_montaza (
  id                       uuid primary key default gen_random_uuid(),
  uredjaj_id               uuid not null references app.uredjaj(id),
  kontejner_id             uuid not null references app.kontejner(id),
  konfigurisana_dubina_cm  integer not null check (konfigurisana_dubina_cm > 0),
  montiran_od              timestamptz not null,
  montiran_do              timestamptz,
  check (montiran_do is null or montiran_do > montiran_od),
  -- One device cannot be on two containers at once, and one container cannot
  -- have two devices at once. Enforced rather than documented, because ingest
  -- resolves container identity through exactly this table.
  exclude using gist (
    uredjaj_id with =,
    tstzrange(montiran_od, montiran_do) with &&
  ),
  exclude using gist (
    kontejner_id with =,
    tstzrange(montiran_od, montiran_do) with &&
  )
);

create index uredjaj_montaza_kontejner_idx on app.uredjaj_montaza (kontejner_id, montiran_od desc);
