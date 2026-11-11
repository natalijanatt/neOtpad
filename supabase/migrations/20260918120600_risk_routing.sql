-- Risk scoring, black spots, the fleet and the daily route plans.

create table app.rizik (
  id             uuid primary key default gen_random_uuid(),
  subjekat_tip   app.subjekat_rizika not null,
  subjekat_id    uuid not null,
  izracunato_at  timestamptz not null default now(),
  skor           numeric(6,3) not null,
  -- Every contributing term, kept so the UI can answer "why is this village on
  -- the list". A risk-weighted objective is only defensible if it is explainable
  -- to the people whose village it does or does not include.
  komponente     jsonb not null,
  klasifikacija  text not null   -- nizak | srednji | visok | crna_tacka
);

-- Polymorphic by design: containers, settlements and dump sites are scored by
-- the same pipeline, and a real FK per subject type would triple the table.
create index rizik_subjekat_idx on app.rizik (subjekat_tip, subjekat_id, izracunato_at desc);

create table app.crna_tacka (
  id                uuid primary key default gen_random_uuid(),
  naselje_id        uuid references app.naselje(id),
  tacka             extensions.geography(Point,4326),
  kanonska_id       uuid references app.deponija_kanonska(id),
  prvi_put          date,
  poslednji_put     date,
  broj_ponavljanja  integer not null default 1,
  -- cesci_odvoz | dodati_kontejner | premestiti_kontejner | akcija_ciscenja | nadzor.
  -- 'dodati_kontejner' is the LPUO's own finding turned into a recommendation:
  -- a cleared site refills unless a container replaces it.
  preporuka         text not null,
  obrazlozenje      text not null,
  status            text not null default 'predlozeno',
  sprovedeno_at     timestamptz
);

create index crna_tacka_tacka_idx on app.crna_tacka using gist (tacka);

create table app.vozilo (
  id                 uuid primary key default gen_random_uuid(),
  oznaka             text not null unique,
  kapacitet_m3       numeric(6,2) not null,
  kapacitet_kg       numeric(8,2),
  potrosnja_l_100km  numeric(5,2),
  depo               extensions.geography(Point,4326) not null,
  aktivno            boolean not null default true
);

create table app.plan_rute (
  id                   uuid primary key default gen_random_uuid(),
  datum                date not null,
  vozilo_id            uuid not null references app.vozilo(id),
  -- Plans are generated as 'predlog' and a dispatcher approves them. A system
  -- that silently dispatches trucks on day one does not get trusted, and the
  -- approval step is where a human sees the reason on each stop.
  status               text not null default 'predlog',
  generisan_at         timestamptz not null default now(),
  algoritam            text not null,
  -- The weights this plan was produced with. "Cost optimisation and the
  -- ecological goal are the same objective" is a claim; storing the weights is
  -- what lets anyone check it afterwards.
  cilj_funkcija        jsonb not null,
  ukupna_distanca_m    integer,
  ukupno_trajanje_min  integer,
  unique (datum, vozilo_id, generisan_at)
);

create index plan_rute_datum_idx on app.plan_rute (datum, status);

create table app.stajaliste_rute (
  id                  uuid primary key default gen_random_uuid(),
  plan_rute_id        uuid not null references app.plan_rute(id) on delete cascade,
  redosled            integer not null,
  sabirno_mesto_id    uuid references app.sabirno_mesto(id),
  kontejner_id        uuid references app.kontejner(id),
  prijava_id          uuid references app.prijava(id),
  planirani_dolazak   timestamptz,
  ocekivano_punjenje  smallint,
  -- rutinski | prelivanje_rizik | rizik_divlje_deponije | prijava | usput.
  -- A remote village has to be able to show its own reason for being on the
  -- route, otherwise "distance did not drop it" is unverifiable.
  razlog              text not null,
  doprinos_ceni       numeric(8,2),
  stvarni_dolazak     timestamptz,
  izvrseno            boolean not null default false,
  potvrda_izvora      text,   -- senzor_praznjenje | vozac | gps
  unique (plan_rute_id, redosled),
  -- A stop is a place: a collection point, a single container, or a report.
  -- A stop that points at nothing is a planning bug, not a row.
  check (num_nonnulls(sabirno_mesto_id, kontejner_id, prijava_id) >= 1)
);

-- Deferred from the telemetry migration: an emptying event confirms a planned
-- stop, which is the free ground truth that the route was actually driven.
alter table app.praznjenje
  add constraint praznjenje_stajaliste_fk
  foreign key (stajaliste_rute_id) references app.stajaliste_rute(id) on delete set null;

-- So the optimiser is not re-measuring the same pair every night. 'izvor'
-- separates a straight-line estimate from a real road distance, so swapping in
-- OSRM later adds rows instead of requiring a migration.
create table app.rastojanje (
  id             uuid primary key default gen_random_uuid(),
  od_tacka       extensions.geography(Point,4326) not null,
  do_tacka       extensions.geography(Point,4326) not null,
  izvor          text not null,   -- haversine | osrm
  distanca_m     integer not null,
  trajanje_s     integer,
  izracunato_at  timestamptz not null default now(),
  unique (od_tacka, do_tacka, izvor)
);
