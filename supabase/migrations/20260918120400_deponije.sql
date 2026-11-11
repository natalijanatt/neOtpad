-- Historical illegal dumps, mirroring waste-scraper/data/ one-to-one so that any
-- row can be traced back to the CSV it came from.
--
-- The traps documented in docs/data-sources.md are encoded as constraints here
-- rather than described in a comment somewhere. A caveat that only lives in prose
-- gets violated by the third query somebody writes.

create table app.deponija_kanonska (
  id                        uuid primary key default gen_random_uuid(),
  kanonski_id               text not null unique,      -- 'K-01'
  naziv                     text,
  naselje_id                uuid references app.naselje(id),
  tacka                     extensions.geography(Point,4326),
  geo_preciznost            app.geo_preciznost not null,
  prvi_put_zabelezena       integer,
  poslednji_put_zabelezena  integer,
  godine_evidentirana       integer[] not null default '{}',
  izvori                    text[] not null default '{}',
  broj_izvornih_redova      integer not null default 1,
  broj_opservacija          integer not null default 0,
  ponovo_se_stvara          app.trojstvo not null default 'nepoznato',
  status                    text,
  spajanje_pouzdanost       app.pouzdanost_spajanja,
  -- The Eko Alert default coordinate 43.1682819, 22.5956678 is the reporting
  -- site's placeholder, not a place. Tying precision to the presence of a point
  -- makes it structurally impossible to store "unknown" as if it were surveyed.
  constraint nepoznato_nema_tacku
    check ((geo_preciznost = 'nepoznato') = (tacka is null))
);

create index deponija_kanonska_tacka_idx on app.deponija_kanonska using gist (tacka);

create table app.deponija_lokacija (
  id                        uuid primary key default gen_random_uuid(),
  location_id               text not null unique,      -- 'SEPA-01'
  kanonska_id               uuid references app.deponija_kanonska(id),
  naziv                     text,
  naselje_id                uuid references app.naselje(id),
  tacka                     extensions.geography(Point,4326),
  geo_preciznost            app.geo_preciznost not null,
  katastarska_parcela       text,
  katastarska_opstina       text,
  prvi_put_zabelezena       integer,
  poslednji_put_zabelezena  integer,
  godine_evidentirana       integer[] not null default '{}',
  -- Registry prose ("komunalni (registar ne specificira)"), deliberately not the
  -- tip_otpada enum: forcing it into the enum would invent a precision the
  -- registry never had.
  tip_otpada_opis           text,
  povrsina_m2               numeric(10,2),
  zapremina_m3              numeric(10,2),
  kolicina_t                numeric(10,2),
  ciscenja_godisnje         integer,
  ociscena_datum            date,
  ponovo_se_stvara          app.trojstvo not null default 'nepoznato',
  status                    text,
  izvor                     text not null,
  izvor_url                 text,
  napomena                  text,
  spajanje_pouzdanost       app.pouzdanost_spajanja,
  -- Kept verbatim from the CSV. A 'srednja' merge must be explainable in the UI;
  -- presenting it as one confirmed site without the reasoning is a lie the data
  -- does not support.
  spajanje_razlog           text,
  constraint nepoznato_nema_tacku
    check ((geo_preciznost = 'nepoznato') = (tacka is null))
);

create index deponija_lokacija_tacka_idx on app.deponija_lokacija using gist (tacka);
create index deponija_lokacija_kanonska_idx on app.deponija_lokacija (kanonska_id);

create table app.deponija_opservacija (
  id             uuid primary key default gen_random_uuid(),
  lokacija_id    uuid references app.deponija_lokacija(id),
  kanonska_id    uuid references app.deponija_kanonska(id),
  datum          date,               -- often NULL: the registry records only a year
  godina         integer not null,
  tip_dogadjaja  text not null,      -- strateski_dokument | godisnja_evidencija | prijava | sanacija
  tacka          extensions.geography(Point,4326),
  povrsina_m2    numeric(10,2),
  zapremina_m3   numeric(10,2),
  kolicina_t     numeric(10,2),
  -- "A dozen dumps near Izvor" is one row. Every count derived from this table
  -- is a lower bound, and this column is how the UI can say so honestly.
  broj_deponija  integer not null default 1,
  izvor          text not null,
  izvor_url      text,
  opis           text
);

create index deponija_opservacija_kanonska_idx on app.deponija_opservacija (kanonska_id, godina);

-- 2017 has no Pirot rows at all and the 2018 locations never reappear. That is a
-- change of reporting method, not a drop in dumping. Any aggregation joins this
-- table and refuses to draw one line across two comparability groups.
create table app.izvorna_serija (
  id                  uuid primary key default gen_random_uuid(),
  izvor               text not null,
  godina_od           integer not null,
  godina_do           integer not null,
  grupa_uporedivosti  text not null,
  napomena            text not null
);

-- Clean-up actions. The LPUO records that a cleared site refills unless a
-- container is placed, so an action followed by a later observation at the same
-- spot is how the system measures whether its own recommendation worked.
create table app.akcija_ciscenja (
  id                  uuid primary key default gen_random_uuid(),
  kanonska_id         uuid references app.deponija_kanonska(id),
  mesna_zajednica_id  uuid references app.mesna_zajednica(id),
  datum               date not null,
  organizator         text,
  broj_ucesnika       integer,
  uklonjeno_t         numeric(10,2),
  mehanizacija        boolean not null default false,
  status              text not null default 'planirana'
);
