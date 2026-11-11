# Backend architecture

How the NestJS backend is organised and what the database looks like.
`CLAUDE.md` says *what* we build; this page says *where each part lives*.

The database schema in this document is applied by `supabase/migrations/`,
which is the complete schema reference; the examples below describe the
broader design. Of the feature modules, health, staff authentication,
reports/triage, minimal reporting lookups and `routing` (the phase-1 greedy
planner, `POST /routes/plan`, `GET /routes`) are implemented. The other
feature modules and scheduled jobs below remain planned. See
[reports-mvp.md](reports-mvp.md) for the implemented report lifecycle,
additional workflow tables, setup and API behavior, and
[routing-heuristic.md](routing-heuristic.md) for the routing algorithm.

Read this together with [`sensor-telemetry.md`](sensor-telemetry.md) (the input
side) and [`data-sources.md`](data-sources.md) (the historical side), because
most of the odd-looking decisions below exist to enforce a caveat from one of
those two pages.

## Phasing

| Phase | Scope |
|---|---|
| **1 — demo** | Settlements, containers, devices, telemetry ingest, current state, citizen reports (incl. the SMS shape), illegal-dump import from `waste-scraper/`, risk score, greedy route generation. |
| **2 — credible** | Forecasting with the seasonality calendar, black-spot recommendations, incentives and the village competition, outbound notifications, route execution feedback. |
| **3 — real** | Road-distance matrix (OSRM), OR-Tools optimiser, LoRaWAN network-server webhook against real hardware, full role-based access for the utility. |

Every table below belongs to phase 1 or 2. Phase 3 changes implementations
behind ports, not the schema.

## Stack decisions

**Supabase, as a database and — for photographs only — an object store.** It
supplies PostgreSQL 17 with PostGIS, a migration tool and a local stack that
starts with one command. Auth, Realtime, Edge Functions and PostgREST are
switched off in `supabase/config.toml`: the NestJS API is the only client of this
database, and the generated contract stays the only thing the frontend sees.
Using Supabase's API layer as well would mean two contracts, one of them
ungenerated.

Report photos are the one exception, and a narrow one: they go to a Supabase
Storage bucket over the S3 protocol, written by the API with server-side
credentials. The browser uploads to `POST /reports/photos` and never to Supabase,
so there is still no second contract, and Postgres still stores only a key and a
URL. Everything about that bucket — its name, the accepted content, the staged
upload flow, the privacy consequences of it being public — is in
[`media-storage.md`](media-storage.md).

**PostGIS.** The domain is geographic end to end: routing, distance, clustering
dump observations into canonical sites, judging which villages a gateway really
covers. PostGIS also reproduces the de-duplication the CSVs currently carry
pre-computed (`ST_ClusterDBSCAN` ≈ `kanonski_id`). `jsonb` covers raw device
payloads and optimiser weights without extra infrastructure.

**Kysely, not an ORM.** The schema is owned by SQL migrations, because the parts
that carry the domain rules — the exclusion constraints on `uredjaj_montaza`, the
generated `pouzdano` column, the `nepoznato_nema_tacku` checks, range
partitioning — have no expression in an entity decorator. An ORM on top would
either lose them or fight them. `kysely-codegen` reads the live database and
writes `backend/src/database/generated/schema.ts`, so the types are derived from
the schema rather than asserted alongside it — the same pattern as the contract
and the frontend client, which is the third generated artifact in this repo.
The repository pattern from `backend/.claude/skills/nestjs-best-practices`
applies unchanged; only the query builder inside a repository differs.

**No time-series extension yet.** `ocitavanje` is append-only and will be the
largest table, but a few hundred sensors at even a 15-minute cadence is a few
million rows a year — native monthly partitioning plus the right index is
enough. TimescaleDB is a phase-3 swap that does not change the columns.

**Jobs now, queues later.** Nightly forecasting, risk recomputation and route
generation start as `@nestjs/schedule` cron methods that do nothing but call a
service. Moving them onto BullMQ is then mechanical — so no job logic goes in
the cron method itself.

**Extensions required:** `postgis` and `btree_gist` (the overlap constraints on
`uredjaj_montaza`), both installed into the `extensions` schema by the first
migration. `gen_random_uuid()` is built into Postgres 13+, so no extension is
needed for keys.

## Running it locally

```bash
npm install                 # repository root: lefthook + the Supabase CLI
npm run db:start            # Postgres 17 + PostGIS on :54322, migrations + seed applied
npm run db:status           # prints DB URL; Studio is on :54323

cd backend
cp .env.example .env        # DATABASE_URL points at the local stack
npm install
npm run db:types            # regenerate row types from the live schema
npm run start:dev           # :3000, Swagger UI at /docs
```

`npm run db:reset` drops and rebuilds from the migrations plus `seed.sql` — the
fastest way to check that a migration works from nothing, which is the only
state that matters on a fresh clone.

Only the `db`, `api` and `studio` containers start: everything else is disabled
in `config.toml`. Studio is kept because browsing the schema during a hackathon
is worth one container, and it reaches Postgres directly rather than through
anything the application uses.

## Module map

Feature modules, not technical layers (`arch-feature-modules`). Arrows are the
only direction dependencies may go; anything else is a circular dependency
waiting to happen (`arch-avoid-circular-deps`).

```
                          ┌──────────────┐
                          │    geo       │  naselje, mesna zajednica, aliases
                          └──────┬───────┘
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
      ┌────────────┐      ┌────────────┐      ┌────────────┐
      │ containers │      │  deponije  │      │  calendar  │
      │ sabirno    │      │ historical │      │ slave,     │
      │ mesto,     │      │   dumps    │      │ vasari,    │
      │ kontejner  │      └─────┬──────┘      │ praznici   │
      └─────┬──────┘            │             └─────┬──────┘
            ▼                   │                   │
      ┌────────────┐            │                   │
      │  devices   │            │                   │
      │ uredjaj +  │            │                   │
      │  montaza   │            │                   │
      └─────┬──────┘            │                   │
            ▼                   │                   │
      ┌────────────┐            │                   │
      │ telemetry  │            │                   │
      │  ingest,   │            │                   │
      │ ocitavanje │            │                   │
      └─────┬──────┘            │                   │
            │                   ▼                   ▼
            │            ┌─────────────┐     ┌─────────────┐
            ├───────────▶│    risk     │◀────│ forecasting │
            │            │   skor,     │     │  fill curve │
            │            │ crne tacke  │     └──────┬──────┘
            │            └──────┬──────┘            │
   ┌────────▼────────┐          ▼                   ▼
   │     reports     │    ┌──────────────────────────────┐
   │ prijave,        │───▶│           routing            │
   │ gradjani,       │    │ vozila, plan rute, stajalista│
   │ posrednici      │    └───────────────┬──────────────┘
   └────────┬────────┘                    │
            │                             ▼
            │                    ┌─────────────────┐
            └───────────────────▶│  notifications  │  SMS / Viber / posrednik
                                 └─────────────────┘

   ┌─────────────┐
   │ incentives  │  points ledger + village competition (reads reports, akcije)
   └─────────────┘
```

`geo` is imported by nearly everything and imports nothing — it is the only
module allowed to be that popular. `notifications` is a leaf: it gets called, it
never calls back (`arch-module-sharing`).

`classification` is a leaf of the same kind, and nothing imports it either: it
reads `prijava` through its own repository, and `reports` hands it work by
inserting an outbox row inside the report's own transaction rather than by
calling it ([report-classification.md](report-classification.md)).

Cross-module reactions go through events, not imports (`arch-use-events`):

| Event | Emitted by | Listened to by |
|---|---|---|
| `ocitavanje.primljeno` | telemetry | containers (state), risk, forecasting (invalidate) |
| `ocitavanje.alarm` | telemetry | notifications (fire, tipped), containers (maintenance task) |
| `praznjenje.detektovano` | telemetry | routing (stop confirmed), forecasting (curve reset) |
| `prijava.potvrdjena` | reports | risk, routing, incentives |
| `ruta.zavrsena` | routing | risk, forecasting |

That table is also why `telemetry` does not import `routing`: a single reading
must never reach into route planning synchronously.

## Layering inside a module

```
src/<feature>/
  dto/                       request + response DTOs, @ApiProperty on every field
  <feature>.controller.ts    HTTP only: validate, delegate, map to a response DTO
  <feature>.service.ts       business rules
  <feature>.model.ts         domain types — a row with the storage encodings off
  <feature>.mapper.ts        row → model, pure functions, no dependencies
  <feature>.repository.ts    all query building (arch-use-repository-pattern)
  <feature>.module.ts
```

There is no `entities/` directory: row types come from the generated
`src/database/generated/schema.ts`, and a hand-written duplicate of the schema is
exactly the drift this setup exists to prevent.

`<feature>.model.ts` is not that duplicate. A row carries the database's
encodings — `geography` as an EWKB string, `numeric` as a string, `date` as a
`Date` at local midnight, `bigserial` as a string that must stay one — and a
model is the same data with those taken off, so that services reason about
coordinates and numbers rather than about wire formats. Field names stay the
column names, which keeps a model field traceable back to the CSV it came from.
The row types are still the generated ones: every mapper takes
`Selectable<DB['app.<table>']>`, so a dropped column is a compile error rather
than a silently missing field.

The conversions live in two shared places and nowhere else:
`common/geo.ts` (`toPoint` for writes, `fromPoint` for reads) and
`common/row-values.ts` (`toNumber`, `toIsoDate`, `toInstant`, `toId`). Three of
them exist because the obvious version is wrong: `toISOString()` on a `date`
moves the day backwards in Belgrade, a `numeric` read as-is is a string that
compares wrong, and a `bigserial` read as a number loses digits. Mappers are
plain functions rather than providers — a service that maps its own rows is
easier to test than one that injects a mapper to do it.

Models are phase-1 tables only, one file per feature module: `geo`,
`containers`, `devices`, `telemetry`, `deponije`, `reports`, `risk`, `routing`.

The row/DTO split is not ceremony, though. Rows carry fields the API must never
expose — a citizen's phone number, raw device payloads, merge reasoning — and the
contract is generated from DTOs, so returning a row straight from a controller
silently turns a column into a public API promise
(`api-use-dto-serialization`, `security-sanitize-output`). Repositories return
rows; services map to models and then to DTOs; controllers never see a row. A
model is *internal*: `Gradjanin.telefon_e164` and `Posrednik.telefon_e164` exist
on it because notifications need them, and that is precisely why a model must
never be returned from a controller either.

## Naming

`CLAUDE.md` says domain fields that mirror source data keep their Serbian name.
Applied concretely the rule is **follow the source**, which splits cleanly:

- Tables and columns for settlements, dumps, reports, routes and containers
  follow the CSV headers and the glossary: `naselje`, `ponovo_se_stvara`,
  `geo_preciznost`, `prijava`. ASCII only, no diacritics — the source CSVs are
  already written that way (`povrsina_m2`, `ociscena_datum`).
- Telemetry columns follow [`sensor-telemetry.md`](sensor-telemetry.md), whose
  documented payload is English: `distance_cm`, `fill_percent`, `battery_mv`.
  That page *is* the source for those fields.
- Services, modules, guards, interceptors, generic infrastructure: English.

So `TelemetryIngestService` writes `distance_cm` into `ocitavanje`, and no part
of that sentence needs a translation table.

## Schema

[`schema.drawio`](schema.drawio) is this section as a picture: every table,
column and foreign key, grouped in the same areas as the module map above. It is
introspected from the live database by `npm run db:erd`, never drawn by hand, so
a table that is missing from it is a table that does not exist.

The DDL below is what actually runs: it is a lightly trimmed reading of
`supabase/migrations/`, which is the source of truth. Table names are unqualified
here for readability; in the migrations everything is `app.`-qualified and
PostGIS types are `extensions.`-qualified, so nothing depends on a `search_path`.

`geography(Point,4326)` throughout, because distances are wanted in metres and
the area is small enough that the projection question never becomes
interesting.

### Geography

```sql
CREATE TABLE mesna_zajednica (
  id       uuid PRIMARY KEY,
  naziv    text NOT NULL UNIQUE,
  opstina  text NOT NULL DEFAULT 'Pirot'
);

CREATE TABLE naselje (
  id                        uuid PRIMARY KEY,
  naziv                     text NOT NULL,
  sifra_mesta               text UNIQUE,    -- SEPA place code (732397): the only stable join key across sources
  mesna_zajednica_id        uuid REFERENCES mesna_zajednica(id),
  opstina                   text NOT NULL DEFAULT 'Pirot',
  centroid                  geography(Point,4326) NOT NULL,
  granica                   geography(Polygon,4326),
  broj_domacinstava         integer,
  kategorija_naselja        text,           -- LPUO size class I/II/III/IV; the only size signal for 49 settlements
  -- The strongest predictor in the system: 23 of the 72 settlements are on JP
  -- Komunalac's collection round, the rest are not, and that is where dumps
  -- appear. Three-state rather than boolean because the answer is imported from
  -- documents: a settlement whose source does not discuss collection must not
  -- arrive as false, which reads as the strongest possible reason to expect a
  -- dump. Evidence and its date live in pokrivenost_naselja.
  organizovano_prikupljanje trojstvo NOT NULL DEFAULT 'nepoznato',
  pristup_kamionu           text,           -- free text until surveyed; blocks routing when impassable
  udaljenost_od_baze_km     numeric(6,2),
  -- Imported and re-imported from documents, so it needs a key. The registry
  -- publishes sifra_mesta for five of the 72; the name is what every source has.
  UNIQUE (naziv, opstina)
);

-- Coverage as a dated observation rather than a standing fact. The one document
-- that names the served settlements is from 2018 and counts containers placed in
-- 2013; a 2026 answer from the utility has to land beside it, not over it,
-- because the difference between the two is the thing worth seeing.
CREATE TABLE pokrivenost_naselja (
  id                    uuid PRIMARY KEY,
  naselje_id            uuid NOT NULL REFERENCES naselje(id),
  izvor                 text NOT NULL,
  izvor_url             text,
  godina                integer NOT NULL,
  organizovano          trojstvo NOT NULL,
  odvoz_nedeljno        smallint,   -- collections per week as the utility plans them
  broj_domacinstava     integer,
  broj_stanovnika       integer,
  broj_kontejnera_1100l integer,
  napomena              text,
  UNIQUE (naselje_id, izvor, godina)
);

-- The CSVs hold 'Sukovo' and 'selo sukovo' as separate rows for one place.
-- Import resolves through this table; an unmatched alias is a review task,
-- never a silently created new settlement.
CREATE TABLE naselje_alias (
  id          uuid PRIMARY KEY,
  naselje_id  uuid NOT NULL REFERENCES naselje(id),
  alias       text NOT NULL,
  izvor       text NOT NULL,
  UNIQUE (alias, izvor)
);
```

### Assets and devices

```sql
-- 'suvi_reciklabilni' is the blue bin: Pirot's primary separation is the LPUO's
-- "two bins" scheme (t. 6.6.1) - blue for dry recyclables except glass, green for
-- wet, separate yellow containers for glass. Paper, plastic and metal travel
-- together to the separation line, so the stream is not any single material.
CREATE TYPE tip_otpada AS ENUM
  ('komunalni','pet','staklo','papir','metal','bio','kabasti','gradjevinski',
   'suvi_reciklabilni');

CREATE TABLE sabirno_mesto (
  id                 uuid PRIMARY KEY,
  naselje_id         uuid NOT NULL REFERENCES naselje(id),
  naziv              text NOT NULL,
  lokacija           geography(Point,4326) NOT NULL,
  broj_domacinstava  integer,      -- prioritisation: points serving many households come first
  pristup            text,
  aktivno_od         date NOT NULL,
  aktivno_do         date
);

CREATE TABLE kontejner (
  id                uuid PRIMARY KEY,
  oznaka            text NOT NULL UNIQUE,   -- 'PI-KRU-004', the label on the physical unit
  sabirno_mesto_id  uuid NOT NULL REFERENCES sabirno_mesto(id),
  tip_otpada        tip_otpada NOT NULL,
  zapremina_l       integer NOT NULL,
  postavljen_datum  date NOT NULL,
  uklonjen_datum    date,
  status            text NOT NULL DEFAULT 'aktivan'
);

CREATE TABLE uredjaj (
  id           uuid PRIMARY KEY,
  dev_eui      text NOT NULL UNIQUE,
  model        text,
  proizvodjac  text,
  aktiviran    date,
  status       text NOT NULL DEFAULT 'aktivan'
);

-- Answers the open question in sensor-telemetry.md ("how does a swapped unit keep
-- the container's history intact"): identity belongs to the container, the device
-- is an attachment with a validity period. Depth lives HERE and not on kontejner,
-- because fill % is computed on the device from the depth configured on that unit.
CREATE TABLE uredjaj_montaza (
  id                      uuid PRIMARY KEY,
  uredjaj_id              uuid NOT NULL REFERENCES uredjaj(id),
  kontejner_id            uuid NOT NULL REFERENCES kontejner(id),
  konfigurisana_dubina_cm integer NOT NULL,
  montiran_od             timestamptz NOT NULL,
  montiran_do             timestamptz,
  EXCLUDE USING gist (uredjaj_id   WITH =, tstzrange(montiran_od, montiran_do) WITH &&),
  EXCLUDE USING gist (kontejner_id WITH =, tstzrange(montiran_od, montiran_do) WITH &&)
);
```

Correcting a mis-entered depth is then: close the current `montaza`, open a new
one, recompute `fill_percent_izracunat` for the affected window. The history
stays honest, which is the entire reason `distance_cm` is kept.

### Telemetry

```sql
CREATE TYPE orijentacija AS ENUM ('upright','tipped','emptying');

CREATE TABLE ocitavanje (
  id                     bigserial,
  uredjaj_id             uuid NOT NULL REFERENCES uredjaj(id),
  kontejner_id           uuid NOT NULL REFERENCES kontejner(id),  -- resolved at ingest via the montaza valid at measured_at
  measured_at            timestamptz NOT NULL,   -- device clock; the only one that belongs on a fill curve
  received_at            timestamptz NOT NULL,
  distance_cm            integer NOT NULL,       -- the measurement
  fill_percent           smallint,               -- as sent by the device
  fill_percent_izracunat smallint,               -- recomputed server-side; what every model reads
  temperature_c          numeric(4,1),
  orientation            orijentacija,
  battery_mv             integer,
  battery_percent        smallint,
  status                 text[] NOT NULL DEFAULT '{}',  -- a list: a unit can be dirty AND low on battery
  rssi                   integer,
  snr                    numeric(4,1),
  gateway_id             text,
  raw_payload            jsonb,
  -- A diagnostic code outranks the measurement: blocked optics read as "full".
  -- Generated, so that no consumer can forget to check it.
  pouzdano               boolean GENERATED ALWAYS AS
                           (status = '{}'::text[] OR status = '{ok}'::text[]) STORED,
  PRIMARY KEY (id, measured_at),
  UNIQUE (uredjaj_id, measured_at)   -- store-and-forward retries: ingest must be idempotent
) PARTITION BY RANGE (measured_at);

CREATE INDEX ON ocitavanje (kontejner_id, measured_at DESC);
```

Routing and forecasting read `fill_percent_izracunat` **only where `pouzdano`**.
An unreliable reading raises a maintenance task, never a routing priority — per
`sensor-telemetry.md` that is the most likely way this system sends a truck for
nothing.

```sql
-- One row per container, overwritten on ingest. The map and the dashboard read
-- this; nothing scans ocitavanje to answer "how full is it now".
CREATE TABLE kontejner_stanje (
  kontejner_id      uuid PRIMARY KEY REFERENCES kontejner(id),
  fill_percent      smallint,
  measured_at       timestamptz,
  trend_pp_po_danu  numeric(5,2),
  baterija_percent  smallint,
  aktivni_status    text[] NOT NULL DEFAULT '{}',
  -- Prolonged silence is a data gap, not an empty container. An explicit column
  -- so the UI shows "no data" instead of a reassuring 0%.
  tih_od            timestamptz
);

CREATE TYPE tip_alarma AS ENUM
  ('pozar','prevrnut','optika_blokirana','baterija_niska','tisina','prelivanje');

CREATE TABLE alarm (
  id            uuid PRIMARY KEY,
  kontejner_id  uuid REFERENCES kontejner(id),
  uredjaj_id    uuid REFERENCES uredjaj(id),
  tip           tip_alarma NOT NULL,
  nastao_at     timestamptz NOT NULL,
  potvrdjen_at  timestamptz,
  zatvoren_at   timestamptz,
  prioritet     smallint NOT NULL
);

-- Ground truth that a truck actually serviced the container, and the reset point
-- of every fill curve. Free, because the sensor reports 'emptying' from tilt.
CREATE TABLE praznjenje (
  id                  uuid PRIMARY KEY,
  kontejner_id        uuid NOT NULL REFERENCES kontejner(id),
  detektovano_at      timestamptz NOT NULL,
  izvor               text NOT NULL,   -- senzor_tilt | senzor_pad_nivoa | vozac | rucno
  stajaliste_rute_id  uuid
);
```

`pozar` (>70 °C) never enters the nightly optimisation: the alarm row is written
and `notifications` is called on the spot.

### Seasonality calendar

The forecasting input `CLAUDE.md` names explicitly, held as data rather than
hard-coded rules — a `slava` date differs per village and nobody will redeploy
for it.

```sql
CREATE TYPE tip_dogadjaja_kal AS ENUM
  ('drzavni_praznik','slava','vasar','zetva','sezonski_radnici','povratnici','skolski_raspust');

CREATE TABLE kalendarski_dogadjaj (
  id                  uuid PRIMARY KEY,
  naziv               text NOT NULL,
  tip                 tip_dogadjaja_kal NOT NULL,
  naselje_id          uuid REFERENCES naselje(id),          -- NULL = the whole city
  mesna_zajednica_id  uuid REFERENCES mesna_zajednica(id),
  datum_pocetka       date NOT NULL,
  datum_kraja         date NOT NULL,
  ponavljanje         text,          -- RRULE; Orthodox feasts move, so a fixed date is not enough
  ocekivani_faktor    numeric(4,2),  -- multiplier on the generation rate; seeded by hand, refined from data
  izvor               text,
  napomena            text
);
```

### Forecasting

```sql
CREATE TABLE prognoza_punjenja (
  id                uuid PRIMARY KEY,
  kontejner_id      uuid NOT NULL REFERENCES kontejner(id),
  izracunata_at     timestamptz NOT NULL,
  horizont_do       timestamptz NOT NULL,
  ulazni_podaci_do  timestamptz NOT NULL,   -- last reading used; makes a stale forecast visible
  serija            jsonb NOT NULL,         -- [{t, p10, p50, p90}] — read whole, never queried into
  vreme_kriticnog   timestamptz,            -- ETA to critical level; what routing sorts on
  ima_rupu          boolean NOT NULL,       -- gaps were present, and were NOT interpolated away
  model_verzija     text NOT NULL,
  pouzdanost        text NOT NULL
);

CREATE INDEX ON prognoza_punjenja (kontejner_id, izracunata_at DESC);
```

Forecasts are kept, not overwritten: comparing yesterday's prediction against
today's measurement is the only honest accuracy metric, and a demo that can show
it is worth more than one that cannot.

### Historical illegal dumps

Three tables mirroring `waste-scraper/data/` one-to-one, so any row can be
traced back to the CSV it came from.

```sql
CREATE TYPE geo_preciznost_t    AS ENUM ('registarska_tacka','centroid_naselja','geokodirano','nepoznato');
CREATE TYPE trojstvo            AS ENUM ('da','ne','nepoznato');
CREATE TYPE pouzdanost_spajanja AS ENUM ('visoka','srednja','niska');

CREATE TABLE deponija_kanonska (
  id                        uuid PRIMARY KEY,
  kanonski_id               text NOT NULL UNIQUE,     -- 'K-01'
  naziv                     text,
  naselje_id                uuid REFERENCES naselje(id),
  tacka                     geography(Point,4326),    -- NULL when precision is 'nepoznato'
  geo_preciznost            geo_preciznost_t NOT NULL,
  prvi_put_zabelezena       integer,
  poslednji_put_zabelezena  integer,
  godine_evidentirana       integer[] NOT NULL DEFAULT '{}',
  izvori                    text[] NOT NULL DEFAULT '{}',
  broj_izvornih_redova      integer NOT NULL DEFAULT 1,
  broj_opservacija          integer NOT NULL DEFAULT 0,
  ponovo_se_stvara          trojstvo NOT NULL DEFAULT 'nepoznato',
  status                    text,
  spajanje_pouzdanost       pouzdanost_spajanja,
  -- The Eko Alert default coordinate (43.1682819, 22.5956678) means "unknown
  -- location". Encoding that as a constraint makes it structurally impossible to
  -- store an unknown as if it were a place.
  CONSTRAINT nepoznato_nema_tacku
    CHECK ((geo_preciznost = 'nepoznato') = (tacka IS NULL))
);

CREATE TABLE deponija_lokacija (
  id                        uuid PRIMARY KEY,
  location_id               text NOT NULL UNIQUE,     -- 'SEPA-01'
  kanonska_id               uuid REFERENCES deponija_kanonska(id),
  naziv                     text,
  naselje_id                uuid REFERENCES naselje(id),
  tacka                     geography(Point,4326),
  geo_preciznost            geo_preciznost_t NOT NULL,
  katastarska_parcela       text,
  katastarska_opstina       text,
  prvi_put_zabelezena       integer,
  poslednji_put_zabelezena  integer,
  godine_evidentirana       integer[] NOT NULL DEFAULT '{}',
  tip_otpada_opis           text,     -- registry prose, deliberately NOT the tip_otpada enum
  povrsina_m2               numeric(10,2),
  zapremina_m3              numeric(10,2),
  kolicina_t                numeric(10,2),
  ciscenja_godisnje         integer,
  ociscena_datum            date,
  ponovo_se_stvara          trojstvo NOT NULL DEFAULT 'nepoznato',
  status                    text,
  izvor                     text NOT NULL,
  izvor_url                 text,
  napomena                  text,
  spajanje_pouzdanost       pouzdanost_spajanja,
  spajanje_razlog           text,     -- verbatim: a 'srednja' merge must be explainable in the UI
  CONSTRAINT nepoznato_nema_tacku
    CHECK ((geo_preciznost = 'nepoznato') = (tacka IS NULL))
);

CREATE TABLE deponija_opservacija (
  id             uuid PRIMARY KEY,
  lokacija_id    uuid REFERENCES deponija_lokacija(id),
  kanonska_id    uuid REFERENCES deponija_kanonska(id),
  -- The confirmed citizen report this came from, and the line between the two
  -- writers of this table: NULL means the CSV import owns the row and may
  -- replace it (docs/data-sources.md). UNIQUE (prijava_id, tip_dogadjaja) where
  -- prijava_id IS NOT NULL, so re-triaging a report updates instead of adding.
  prijava_id     uuid REFERENCES prijava(id),
  datum          date,               -- often NULL: the registry gives only a year
  godina         integer NOT NULL,
  tip_dogadjaja  text NOT NULL,      -- strateski_dokument | godisnja_evidencija | prijava | sanacija
  tacka          geography(Point,4326),
  povrsina_m2    numeric(10,2),
  zapremina_m3   numeric(10,2),
  kolicina_t     numeric(10,2),
  -- "A dozen dumps near Izvor" is a single row. Every count derived from this
  -- table is a lower bound, and this column is how the UI can say so.
  broj_deponija  integer NOT NULL DEFAULT 1,
  izvor          text NOT NULL,
  izvor_url      text,
  opis           text
);

-- The 2017/2018 break is methodological, not a trend. Aggregations join this
-- table and refuse to draw one line across two comparability groups.
CREATE TABLE izvorna_serija (
  id                  uuid PRIMARY KEY,
  izvor               text NOT NULL,
  godina_od           integer NOT NULL,
  godina_do           integer NOT NULL,
  grupa_uporedivosti  text NOT NULL,
  napomena            text NOT NULL
);
```

### Citizen reports

The module where the no-smartphone constraint either holds or quietly breaks.
Everything nullable here is nullable because an SMS cannot carry it.

```sql
CREATE TYPE kanal_prijave       AS ENUM ('sms','viber','web','mobilna','telefon','posrednik');
CREATE TYPE tip_prijave         AS ENUM ('pun_kontejner','prelivanje','divlja_deponija','ostecen_kontejner','nedostaje_kontejner','drugo');
CREATE TYPE preciznost_lokacije AS ENUM ('gps','opisana','naselje');
CREATE TYPE velicina_problema   AS ENUM ('mala','srednja','velika');

CREATE TABLE gradjanin (
  id             uuid PRIMARY KEY,
  telefon_e164   text UNIQUE,   -- PII: never appears in a response DTO
  ime            text,
  naselje_id     uuid REFERENCES naselje(id),
  kanal          kanal_prijave,
  saglasnost_at  timestamptz,
  bodovi         integer NOT NULL DEFAULT 0   -- denormalised from bod_transakcija, display only
);

-- Local-community presidents, schools. Reporting through a person is a
-- first-class path, not a workaround: it is how villages without smartphones
-- participate at all.
CREATE TABLE posrednik (
  id                  uuid PRIMARY KEY,
  ime                 text NOT NULL,
  uloga               text NOT NULL,   -- predsednik_mz | skola | dom_zdravlja | drugo
  mesna_zajednica_id  uuid REFERENCES mesna_zajednica(id),
  telefon_e164        text,
  aktivan             boolean NOT NULL DEFAULT true
);

CREATE TABLE prijava (
  id                   uuid PRIMARY KEY,
  kratki_kod           text NOT NULL UNIQUE,   -- 'PR-4821': what an SMS reply can quote back
  kanal                kanal_prijave NOT NULL,
  gradjanin_id         uuid REFERENCES gradjanin(id),
  posrednik_id         uuid REFERENCES posrednik(id),
  tip                  tip_prijave NOT NULL,
  opis                 text,
  tacka                geography(Point,4326),
  naselje_id           uuid REFERENCES naselje(id),
  -- An SMS has no GPS. 'naselje' must remain a valid answer, or the whole
  -- rural path is designed out.
  preciznost_lokacije  preciznost_lokacije NOT NULL,
  kontejner_id         uuid REFERENCES kontejner(id),
  kanonska_id          uuid REFERENCES deponija_kanonska(id),
  velicina             velicina_problema,   -- small joins the next truck, large needs a crew and machinery
  status               text NOT NULL DEFAULT 'nova',
  duplikat_od          uuid REFERENCES prijava(id),
  prioritet            numeric(6,2),
  primljena_at         timestamptz NOT NULL,
  potvrdjena_at        timestamptz,
  resena_at            timestamptz
);

CREATE TABLE prijava_foto (
  id             uuid PRIMARY KEY,
  -- Nullable only because of staging: a photo is uploaded before the report
  -- exists, since an anonymous reporter never learns the report id. Null means
  -- unclaimed. See media-storage.md.
  prijava_id     uuid REFERENCES prijava(id) ON DELETE CASCADE,
  kljuc          text NOT NULL UNIQUE,   -- object-store key; survives a bucket rename
  javni_url      text NOT NULL,          -- built once at upload, served as-is
  mime_tip       text NOT NULL,          -- sniffed from the bytes, never the declared type
  velicina_bajt  integer NOT NULL CHECK (velicina_bajt > 0),
  sha256         text NOT NULL,
  otpremljena_at timestamptz NOT NULL DEFAULT now(),
  istice_at      timestamptz,            -- staging deadline; null once claimed
  snimljeno_at   timestamptz,
  -- A row is either attached or temporary. An unattached row with no expiry is
  -- a permanent orphan the cleanup sweep can never see.
  CHECK (prijava_id IS NOT NULL OR istice_at IS NOT NULL)
);

-- The automatic triage proposal. Deliberately NOT columns on prijava: triage is
-- versioned and audited, and confirmation is what feeds routing and the risk
-- map, so a model's guess written there would reach a truck with nobody in the
-- loop. `ishod` records whether the dispatcher agreed.
-- Full rationale: report-classification.md.
CREATE TABLE prijava_klasifikacija (
  id                       uuid PRIMARY KEY,
  prijava_id               uuid NOT NULL REFERENCES prijava(id) ON DELETE CASCADE,
  prijava_verzija          integer NOT NULL,   -- stale for any later version
  status                   status_klasifikacije NOT NULL DEFAULT 'na_cekanju',
  izvor                    izvor_klasifikacije,        -- pravila | model
  model                    text,                       -- 'gpt-4o-mini', 'pravila-v1'
  predlozeni_tip           tip_prijave,
  predlozena_podkategorija podkategorija_prijave,      -- proposal only, not yet on prijava
  predlozena_velicina      velicina_problema,
  predlozeni_tip_obrade    text,
  predlozeni_prioritet     smallint,
  predlozeni_kontejner_id  uuid REFERENCES kontejner(id),   -- only ever an offered candidate
  predlozeni_duplikat_od   uuid REFERENCES prijava(id),
  pouzdanost               numeric(3,2),               -- 0..1, same word as prognoza_punjenja
  obrazlozenje             text,                       -- staff-only, never in the public receipt
  signali                  jsonb NOT NULL DEFAULT '{}',-- written by the API, not the model
  ishod                    ishod_klasifikacije,        -- filled at triage
  pokusaj                  smallint NOT NULL DEFAULT 0,-- bumped on claim, not on failure
  greska                   text,
  kreirana_at              timestamptz NOT NULL,
  obradjena_at             timestamptz,
  UNIQUE (prijava_id, prijava_verzija)
);

-- Raw inbound SMS/Viber before parsing. Kept because keyword parsing will be
-- wrong at first, and the original text is the only way to find out how.
CREATE TABLE dolazna_poruka (
  id            uuid PRIMARY KEY,
  kanal         kanal_prijave NOT NULL,
  posiljalac    text NOT NULL,
  tekst         text NOT NULL,
  primljena_at  timestamptz NOT NULL,
  prijava_id    uuid REFERENCES prijava(id),
  obradjena     boolean NOT NULL DEFAULT false,
  greska        text
);
```

### Risk and black spots

```sql
CREATE TYPE subjekat_rizika AS ENUM ('kontejner','sabirno_mesto','kanonska_deponija','naselje');

CREATE TABLE rizik (
  id             uuid PRIMARY KEY,
  subjekat_tip   subjekat_rizika NOT NULL,
  subjekat_id    uuid NOT NULL,
  izracunato_at  timestamptz NOT NULL,
  skor           numeric(6,3) NOT NULL,
  -- Every contributing term, kept so the UI can answer "why is this village on
  -- the list". The routing objective is only defensible if it is explainable.
  komponente     jsonb NOT NULL,
  klasifikacija  text NOT NULL       -- nizak | srednji | visok | crna_tacka
);

CREATE INDEX ON rizik (subjekat_tip, subjekat_id, izracunato_at DESC);

CREATE TABLE crna_tacka (
  id                uuid PRIMARY KEY,
  naselje_id        uuid REFERENCES naselje(id),
  tacka             geography(Point,4326),
  kanonska_id       uuid REFERENCES deponija_kanonska(id),
  prvi_put          date,
  poslednji_put     date,
  broj_ponavljanja  integer NOT NULL,
  preporuka         text NOT NULL,   -- cesci_odvoz | dodati_kontejner | premestiti_kontejner | akcija_ciscenja
  obrazlozenje      text NOT NULL,
  status            text NOT NULL DEFAULT 'predlozeno',
  sprovedeno_at     timestamptz
);

CREATE TABLE akcija_ciscenja (
  id                  uuid PRIMARY KEY,
  kanonska_id         uuid REFERENCES deponija_kanonska(id),
  mesna_zajednica_id  uuid REFERENCES mesna_zajednica(id),
  datum               date NOT NULL,
  organizator         text,
  broj_ucesnika       integer,
  uklonjeno_t         numeric(10,2),
  mehanizacija        boolean NOT NULL DEFAULT false,
  status              text NOT NULL
);
```

The LPUO finding that a cleared site refills unless a container is placed is
exactly the `dodati_kontejner` recommendation. An `akcija_ciscenja` followed by
a later `deponija_opservacija` at the same spot is how the system measures
whether its own recommendation worked.

Three rules `listBlackSpots` fixed, because `crna_tacka` states none of them in
the schema:

- **Open means not closed, and unknown counts as open.** `status` is closed only
  at `sprovedeno` or `odbaceno`; every other value, including one this code has
  never seen, stays on the list. A recommendation nobody can classify must not
  drop off the dispatcher's list by itself.
- **A black spot is scored through its subject.** There is no `rizik` row for a
  `crna_tacka` — the score comes from the canonical dump it is linked to, and
  from its settlement when it is not. Same fallback routing applies to a stop
  with no score of its own, and the answer says which of the two it used.
- **Precision belongs to the canonical dump.** `crna_tacka.tacka` has no
  `geo_preciznost` column, so a point taken from there is reported as
  `geokodirano` — the bucket the import already uses for derived coordinates,
  including ones read off a citizen report. The canonical dump's point and its
  own flag win when the spot is linked to one, and a spot with neither point is
  `nepoznato` with a null location rather than a placeholder coordinate.

### Routing

```sql
CREATE TABLE vozilo (
  id                 uuid PRIMARY KEY,
  oznaka             text NOT NULL UNIQUE,
  kapacitet_m3       numeric(6,2) NOT NULL,
  kapacitet_kg       numeric(8,2),
  potrosnja_l_100km  numeric(5,2),
  depo               geography(Point,4326) NOT NULL,
  aktivno            boolean NOT NULL DEFAULT true
);

CREATE TABLE plan_rute (
  id                   uuid PRIMARY KEY,
  datum                date NOT NULL,
  vozilo_id            uuid NOT NULL REFERENCES vozilo(id),
  status               text NOT NULL DEFAULT 'predlog',
  generisan_at         timestamptz NOT NULL,
  algoritam            text NOT NULL,
  -- The weights this plan was produced with. Cost and the ecological goal are
  -- one objective; storing the weights is what lets anyone check that claim.
  cilj_funkcija        jsonb NOT NULL,
  ukupna_distanca_m    integer,
  ukupno_trajanje_min  integer,
  UNIQUE (datum, vozilo_id, generisan_at)
);

CREATE TABLE stajaliste_rute (
  id                  uuid PRIMARY KEY,
  plan_rute_id        uuid NOT NULL REFERENCES plan_rute(id) ON DELETE CASCADE,
  redosled            integer NOT NULL,
  sabirno_mesto_id    uuid REFERENCES sabirno_mesto(id),
  kontejner_id        uuid REFERENCES kontejner(id),
  prijava_id          uuid REFERENCES prijava(id),
  planirani_dolazak   timestamptz,
  ocekivano_punjenje  smallint,
  -- Why this stop is here: rutinski | prelivanje_rizik | rizik_divlje_deponije |
  -- prijava | usput. A remote village has to be able to show its own reason.
  razlog              text NOT NULL,
  doprinos_ceni       numeric(8,2),   -- minutes the route grew by when this stop went in
  -- The worst container's score and every term behind it (same rule as
  -- rizik.komponente): razlog is enough for a driver, not for a village asking
  -- why it was skipped. komponente.kontejneri carries every container's own
  -- score too — the sensor is on the container, not the point.
  prioritet           numeric(6,3),
  komponente          jsonb,
  stvarni_dolazak     timestamptz,
  izvrseno            boolean NOT NULL DEFAULT false,
  potvrda_izvora      text,     -- senzor_praznjenje | vozac | gps
  UNIQUE (plan_rute_id, redosled)
);

-- So the optimiser is not re-measuring the same pair every night. 'izvor'
-- separates a straight-line estimate from a real road distance, so swapping in
-- OSRM later is a new set of rows rather than a migration.
CREATE TABLE rastojanje (
  od_tacka       geography(Point,4326) NOT NULL,
  do_tacka       geography(Point,4326) NOT NULL,
  izvor          text NOT NULL,   -- haversine | osrm
  distanca_m     integer NOT NULL,
  trajanje_s     integer,
  izracunato_at  timestamptz NOT NULL,
  PRIMARY KEY (od_tacka, do_tacka, izvor)
);
```

### Schedule and notifications

```sql
-- The baseline fixed schedule. Still needed after the system goes predictive:
-- "when does the truck come" must have an answer for settlements with no
-- sensors, and this is the fallback when optimisation is unavailable.
CREATE TABLE plan_odvoza (
  id                uuid PRIMARY KEY,
  naselje_id        uuid NOT NULL REFERENCES naselje(id),
  zona              text,        -- street or part of a settlement; NULL covers the whole settlement
  tip_otpada        tip_otpada NOT NULL,
  dan_u_nedelji     smallint NOT NULL,
  -- The published schedule is fortnightly ("svaki drugi ponedeljak"), and for
  -- Selo Izvor and Selo Krupac every fourth week. A weekday alone would promise
  -- a truck on a Monday it never comes, so the cycle and one known date that
  -- anchors it are part of the row.
  ciklus_dana       smallint NOT NULL DEFAULT 7,   -- 7 | 14 | 21 | 28
  referentni_datum  date,
  izvor             text,
  izvor_url         text,
  vazi_od           date NOT NULL,
  vazi_do           date,
  CHECK (ciklus_dana = 7 OR referentni_datum IS NOT NULL),
  -- An anchor falling on another weekday is a transcription error, and it stays
  -- silent until a citizen waits for a truck.
  CHECK (referentni_datum IS NULL
         OR extract(isodow FROM referentni_datum) = dan_u_nedelji)
);

CREATE TABLE pretplata (
  id            uuid PRIMARY KEY,
  gradjanin_id  uuid REFERENCES gradjanin(id),
  telefon_e164  text,
  naselje_id    uuid NOT NULL REFERENCES naselje(id),
  kanal         kanal_prijave NOT NULL,
  tip           text NOT NULL,   -- dolazak_kamiona | promena_rasporeda | akcije
  aktivna       boolean NOT NULL DEFAULT true
);

CREATE TABLE obavestenje (
  id            uuid PRIMARY KEY,
  kanal         kanal_prijave NOT NULL,
  primalac      text NOT NULL,   -- E.164, or a reference to an intermediary
  gradjanin_id  uuid REFERENCES gradjanin(id),
  posrednik_id  uuid REFERENCES posrednik(id),
  tip           text NOT NULL,
  sadrzaj       text NOT NULL,
  zakazano_za   timestamptz,
  poslato_at    timestamptz,
  status        text NOT NULL DEFAULT 'na_cekanju',
  eksterni_id   text,
  greska        text
);
```

### Incentives

```sql
-- A ledger, not a counter: the competition scores a time window, and a mutable
-- total cannot be recomputed for last month.
CREATE TABLE bod_transakcija (
  id                  uuid PRIMARY KEY,
  gradjanin_id        uuid REFERENCES gradjanin(id),
  mesna_zajednica_id  uuid REFERENCES mesna_zajednica(id),
  razlog              text NOT NULL,   -- potvrdjena_prijava | ucesce_u_akciji | razvrstavanje
  bodovi              integer NOT NULL,
  prijava_id          uuid REFERENCES prijava(id),
  akcija_id           uuid REFERENCES akcija_ciscenja(id),
  nastalo_at          timestamptz NOT NULL
);

CREATE TABLE rezultat_takmicenja (
  id                  uuid PRIMARY KEY,
  mesna_zajednica_id  uuid NOT NULL REFERENCES mesna_zajednica(id),
  period              daterange NOT NULL,
  -- Measurable indicators only: new dumps, recurrence at cleaned sites,
  -- confirmed-report rate. Rewards are community-level, so the subject is the
  -- mesna zajednica, never a person.
  indikatori          jsonb NOT NULL,
  skor                numeric(8,3) NOT NULL,
  rang                integer,
  UNIQUE (mesna_zajednica_id, period)
);
```

## Ingest pipeline

```
LoRaWAN network server (ChirpStack / TTN / operator)
        │  webhook, HMAC-signed
        ▼
POST /telemetry/uplink
        │  1. verify signature                   (guard)
        │  2. decode payload                     (DecoderPort, per device model)
        │  3. resolve kontejner                  (montaza valid at measured_at)
        │  4. recompute fill                     (distance_cm + konfigurisana_dubina_cm)
        │  5. INSERT ... ON CONFLICT DO NOTHING  (retries are expected, not exceptional)
        ▼
  emit ocitavanje.primljeno ──▶ kontejner_stanje update
                            ├──▶ alarm detection (fire, tilt, fault, silence)
                            └──▶ forecast invalidation
```

Steps 2 and 3 are why the endpoint accepts a *decoded* shape in phase 1: the
network server is undecided (`sensor-telemetry.md`, "Not yet decided"), so the
decoder sits behind a port and the contract is generated against the normalised
shape that page already documents.

The endpoint returns `202 Accepted` and never blocks on listeners. A gateway
retrying because a risk recomputation was slow is a self-inflicted outage.

## Scheduled work

| Job | Cadence | What it does |
|---|---|---|
| `ForecastRunner` | nightly 02:00 | fill curves + `vreme_kriticnog` per container, seasonality applied |
| `ClassificationRunner` | every 15 s | classifies queued citizen reports ([report-classification.md](report-classification.md)) |
| `RiskRecalculator` | nightly 03:00 | `rizik` rows for containers, settlements, canonical dumps |
| `RoutePlanner` | nightly 04:00 | `plan_rute` + `stajaliste_rute` per active vehicle, status `predlog` |
| `SilenceDetector` | hourly | containers past their expected uplink → `tisina` alarm, `tih_od` set |
| `NotificationDispatcher` | every 5 min | `obavestenje` rows that are due |

Every runner checks `common/process-role.ts` and does nothing outside the API
process. A CLI script boots the same `AppModule`, and an interval measured in
seconds fires inside it long before the script exits; a nightly cron only hid
that because no script is still running at 02:00.

Routes are generated as `predlog` and a dispatcher approves them. A system that
silently dispatches trucks on day one will not be trusted by the utility, and
the approval step is also where a human sees the `razlog` on each stop.

## The optimiser port

```ts
// backend/src/routing/optimizer/route-optimizer.port.ts
// Phase 1 ships GreedyRiskAwarePlanner; phase 3 swaps in OR-Tools behind the
// same token (di-use-interfaces-tokens). Nothing else in routing changes.
export const ROUTE_OPTIMIZER = Symbol('ROUTE_OPTIMIZER');

export interface RouteOptimizer {
  readonly algoritam: string;        // written to plan_rute.algoritam
  plan(input: {
    datum: Date;
    sada: Date;                      // "now" for the forecast horizon; injected for tests
    vozila: VehicleCapacity[];
    kandidati: StopCandidate[];      // one per active sabirno_mesto; each carries its own containers with per-container state, forecast, schedule and report
    tezine: ObjectiveWeights;        // stored verbatim into plan_rute.cilj_funkcija
    parametri: RoutingParameters;    // cost model, stored next to the weights
  }): Promise<{ rute: PlannedRoute[]; nepokriveno: UncoveredStop[]; preskoceno: ScoredCandidate[] }>;
}
```

A second port, `DISTANCE_PROVIDER`, hides where distances come from: haversine
times a road factor now, OSRM later, feeding `rastojanje.izvor` either way.

The priority function (`optimizer/priority.ts`) is where the product claim
lives: it combines forecast overflow time, `rizik.skor`, confirmed citizen
reports and the settlement's `organizovano_prikupljanje` flag — so distance
alone can never drop a village. The terms, thresholds and the cost model are in
[`routing-heuristic.md`](routing-heuristic.md). Must-visit stops the fleet
cannot take come back as `nepokriveno` with the constraint that bit, and the
API returns them next to the plans.

## API surface (phase 1)

Contract-first via `backend/.claude/skills/add-endpoint`. `operationId` names the
generated frontend method, so these are chosen to survive.

| Method | Path | operationId |
|---|---|---|
| POST | `/telemetry/uplink` | `ingestUplink` |
| GET | `/containers` | `listContainers` (filter: naselje, sensor, fill, forecast-critical-before; `sa_stanjem` adds state + forecast summary) |
| GET | `/containers/{id}` | `getContainer` |
| GET | `/containers/{id}/readings` | `listContainerReadings` |
| GET | `/containers/{id}/forecast` | `getContainerForecast` |
| GET | `/settlements` | `listSettlements` |
| GET | `/settlements/{id}/schedule` | `getSettlementSchedule` — the SMS answer, over HTTP |
| POST | `/reports` | `createReport` |
| GET | `/reports` | `listReports` |
| POST | `/reports/{id}/triage` | `triageReport` |
| POST | `/reports/{id}/classify` | `classifyReport` — recompute the triage proposal now; advisory |
| GET | `/risk/map` | `getRiskMap` (GeoJSON-shaped, precision flag per feature) |
| GET | `/risk/black-spots` | `listBlackSpots` — open spots by default, each with its recommendation and the score behind it |
| POST | `/routes/plan` | `generateRoutePlan` — on demand; the nightly job will call the same service |
| GET | `/routes` | `listRoutePlans` |
| GET | `/routes/{id}` | `getRoutePlan` |
| POST | `/routes/{id}/approve` | `approveRoutePlan` |
| GET | `/dumps` | `listDumps` — dumps that still stand (`sve` for the whole register); `sa_lokacijom` drops the rows a map cannot draw |
| POST | `/messages/inbound` | `receiveInboundMessage` — SMS/Viber gateway webhook |
| GET | `/news` | `listNews` — public citizen feed ([news-feed.md](news-feed.md)) |
| POST | `/news` | `createNews` — admin only |
| PATCH | `/news/{id}` | `updateNews` — admin only; also pins and unpins |
| DELETE | `/news/{id}` | `deleteNews` — admin only |
| GET | `/disposal/sites` | `listDisposalSites` — real drop-off sites ([disposal-search.md](disposal-search.md)) |
| POST | `/disposal/suggest` | `suggestDisposal` — public, rate-limited; may call OpenAI |
| GET/POST | `/collectors` | `listCollectors`, `createCollector` — admin only |
| DELETE | `/collectors/{id}` | `deleteCollector` — admin only |

`getRiskMap` carries `geo_preciznost` on every feature. A map that renders a
settlement centroid identically to a surveyed registry point invents locations,
and the API is the right place to make that impossible to ignore.

## Security

- Staff (`dispecer`, `vozac`, `admin`) live in `app.korisnik` and authenticate
  with a JWT this API issues, with guards per role (`security-use-guards`,
  `security-auth-jwt`). Supabase Auth is not in use, so there is no second
  identity store to keep in step.
- `POST /reports` is public and rate-limited per phone/IP
  (`security-rate-limiting`) — it is the one endpoint an unauthenticated person
  must be able to reach.
- Webhooks (`/telemetry/uplink`, `/messages/inbound`) authenticate by shared
  secret / HMAC, not JWT.
- `telefon_e164` never appears in a response DTO. Reports are identified to the
  public by `kratki_kod`.
- The `app` schema is locked down twice over: the Supabase API roles (`anon`,
  `authenticated`, `service_role`) have every privilege revoked, and RLS is on
  with no policies. Neither matters while the API connects as the owner and
  PostgREST is off — they matter the day somebody flips one line in
  `config.toml`, which is exactly when nobody is reviewing table grants.

## Migrations, seeding, testing

- SQL migrations in `supabase/migrations/` are the only way the schema changes
  (`db-use-migrations`). New one: `npm run db:new <name>` from the repository
  root. Applied by `npm run db:start`, re-applied from scratch by
  `npm run db:reset`.
- **The timestamp prefix is a key, not a sort order.** Supabase records the
  version (the digits before the first `_`) in
  `supabase_migrations.schema_migrations`, so two files sharing a prefix look
  like one already-applied migration: the second is silently skipped, and only
  on the databases that had the first one. Two branches picked
  `20260919140000` once already, the merge brought both in, and the hosted
  database ended up without `app.prijava_klasifikacija` while every later
  migration was applied — every report submission 500'd on the outbox insert.
  When merging a branch that adds a migration, check the prefix is still unique
  (`ls supabase/migrations | sed 's/_.*//' | sort | uniq -d`); if it is not,
  rename the incoming file to a version higher than anything already applied,
  never to a free slot below it.
- After any schema change, regenerate the row types with
  `cd backend && npm run db:types` and commit the result. It is generated output
  committed like `contracts/openapi.json` is, so CI type-checks without a
  database.
- `supabase/seed.sql` holds only reference data. The historical datasets arrive
  through CSV importers, idempotent on the natural key (`sifra_mesta`,
  `location_id`, `kanonski_id`). The importer is where the CSV traps become
  constraint-satisfying rows: the Eko Alert default coordinate becomes
  `geo_preciznost='nepoznato'` with `tacka IS NULL`, and an unmatched settlement
  name is reported for review rather than becoming a silent new village.
- Two imports exist, both commands rather than endpoints — each needs the
  `waste-scraper/` files and rewrites reference data wholesale, and both modules
  are controller-free so they add nothing to the contract:
  `npm run import:naselja` (`backend/src/geo/import/`) loads the 72 settlements,
  their aliases, the coverage evidence and the published schedule;
  `npm run import:deponije` (`backend/src/deponije/import/`) loads the historical
  dumps and has to run second, because most dump rows name a settlement. Both
  take `--dry-run`, which executes every statement and rolls back. The mapping
  rules and the reasoning behind each one are in
  [`data-sources.md`](data-sources.md).
- Generic CSV reading lives in `backend/src/common/csv/`, shared by both imports;
  `common/geo.ts` holds the `geography(Point,4326)` literal helper.
- Contract generation must never need a database. `scripts/generate-openapi.ts`
  supplies a placeholder `DATABASE_URL` and the pool is lazy, so CI regenerates
  the contract on a machine with no Postgres.
- Tests: controller specs asserting the contract shape (`add-endpoint`, step 5),
  service specs against mocked repositories, one e2e per public endpoint against
  a Postgres test container.

## Open questions

- **Uplink cadence** is undecided (`sensor-telemetry.md`), and `SilenceDetector`
  needs a threshold. Until it is decided, keep it per-device configuration
  rather than a constant.
- **Where the LoRaWAN decoder runs** — network server or our ingest — decides
  whether `raw_payload` holds bytes or decoded JSON.
- **Risk weights** in `cilj_funkcija` have no defensible values yet. Seed them by
  hand, store them per plan, and treat tuning as a phase-2 task with the
  historical observations as the validation set.
- **Container depth** has to be captured during installation. No data source
  provides it, and every fill percentage depends on it.
