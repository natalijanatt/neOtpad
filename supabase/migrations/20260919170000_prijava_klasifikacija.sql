-- Automatic triage of an incoming report: what the problem is, and which service
-- answers it.
--
-- The classification is a *proposal*, and it lives here rather than on
-- app.prijava on purpose. Triage is versioned (prijava.verzija), audited
-- (prijava_istorija demands an actor and a reason) and its confirmation is what
-- feeds routing and the risk map. Writing a model's guess straight into those
-- columns would put it on a truck route with nobody in the loop. So the model
-- fills this table, the dispatcher still fills app.prijava, and `ishod` records
-- whether the two agreed — which is the only honest way to find out how good
-- the classifier actually is before trusting it with anything.

create type app.status_klasifikacije as enum ('na_cekanju', 'uspesna', 'neuspesna', 'zastarela');

-- Which of the two classifiers produced the row. Kept because they are not
-- equally good: 'pravila' is keyword matching that runs with no API key and
-- after the model fails, and a dispatcher reading a proposal deserves to know
-- which one they are looking at.
create type app.izvor_klasifikacije as enum ('pravila', 'model');

-- Did the dispatcher agree. Filled at triage, never by the classifier.
create type app.ishod_klasifikacije as enum ('prihvacena', 'izmenjena', 'odbacena');

-- The finer grain under tip_prijave. These are the problems that today all land
-- in `drugo` while routing completely differently: asbestos does not go on a
-- collection truck, construction debris needs machinery rather than a crew, and
-- ragweed or a burst sewer is not the utility's job at all — and `odbijena`
-- loses the fact that somebody has to be told.
--
-- Deliberately not added to app.prijava yet: prijava's CHECK constraints and the
-- API's response rules are load-bearing for the existing workflow, and this
-- vocabulary has to earn its place on the proposal first.
create type app.podkategorija_prijave as enum (
  'komunalni_otpad',
  'gradjevinski_sut',
  'kabasti_otpad',
  'opasan_otpad',
  'zeleni_otpad',
  'uginula_zivotinja',
  'paljenje_otpada',
  'van_nadleznosti',
  'nepoznato'
);

create table app.prijava_klasifikacija (
  id                       uuid primary key default gen_random_uuid(),
  prijava_id               uuid not null references app.prijava(id) on delete cascade,
  -- The report version the proposal was computed against. A dispatcher who
  -- edits the report invalidates the proposal, and a stale suggestion shown
  -- beside fresh content is worse than none.
  prijava_verzija          integer not null,

  status                   app.status_klasifikacije not null default 'na_cekanju',
  izvor                    app.izvor_klasifikacije,
  -- 'gpt-4o-mini', 'pravila-v1'. Free text because the model name is whatever
  -- the deployment configured, and a rename must not need a migration.
  model                    text,

  predlozeni_tip           app.tip_prijave,
  predlozena_podkategorija app.podkategorija_prijave,
  predlozena_velicina      app.velicina_problema,
  -- Mirrors prijava.tip_obrade, which is text + CHECK rather than an enum.
  predlozeni_tip_obrade    text,
  predlozeni_prioritet     smallint,
  -- Only ever one of the candidates the API put in front of the model. A model
  -- that invents a UUID must fail the foreign key rather than land a route on a
  -- container nobody owns.
  predlozeni_kontejner_id  uuid references app.kontejner(id),
  predlozeni_duplikat_od   uuid references app.prijava(id),

  -- 0..1, same word as prognoza_punjenja.pouzdanost and the same meaning: how
  -- much of a decision may rest on this number.
  pouzdanost               numeric(3,2),
  -- One or two sentences, in Serbian, for the dispatcher. Staff-only: it never
  -- appears in the public receipt, and the prompt forbids copying faces, plates
  -- or house numbers out of a photograph into it.
  obrazlozenje             text,
  -- What the proposal was grounded in: distance to the nearest container and its
  -- fill level, settlement coverage, a black spot nearby. Stored so a dispatcher
  -- can see why, and so a bad proposal can be explained after the fact.
  signali                  jsonb not null default '{}'::jsonb,

  ishod                    app.ishod_klasifikacije,
  -- Bumped when the row is claimed, not when it succeeds: a crash mid-call must
  -- still count against the retry budget, or a poisonous report loops forever.
  pokusaj                  smallint not null default 0,
  greska                   text,
  kreirana_at              timestamptz not null default now(),
  obradjena_at             timestamptz,

  constraint prijava_klasifikacija_verzija_valid check (prijava_verzija > 0),
  constraint prijava_klasifikacija_pokusaj_valid check (pokusaj >= 0),
  constraint prijava_klasifikacija_obrade_valid check (
    predlozeni_tip_obrade is null
    or predlozeni_tip_obrade in ('odvoz', 'ciscenje', 'odrzavanje', 'provera_lokacije')
  ),
  constraint prijava_klasifikacija_prioritet_valid check (
    predlozeni_prioritet is null or predlozeni_prioritet between 1 and 5
  ),
  constraint prijava_klasifikacija_pouzdanost_valid check (
    pouzdanost is null or pouzdanost between 0 and 1
  ),
  -- A successful classification is worthless without the two fields routing
  -- reads, so the database refuses a half-written one.
  constraint prijava_klasifikacija_uspesna_valid check (
    status <> 'uspesna'
    or (izvor is not null and model is not null and predlozeni_tip is not null
        and predlozeni_tip_obrade is not null and pouzdanost is not null
        and obradjena_at is not null)
  ),
  constraint prijava_klasifikacija_neuspesna_valid check (
    status <> 'neuspesna' or (greska is not null and obradjena_at is not null)
  ),
  constraint prijava_klasifikacija_duplikat_valid check (
    predlozeni_duplikat_od is distinct from prijava_id
  ),

  -- One proposal per report version. A re-run replaces it; it does not stack up
  -- a history of guesses beside the report's real, audited one.
  unique (prijava_id, prijava_verzija)
);

-- The worker's queue, and the only index it needs: oldest pending first.
create index prijava_klasifikacija_red_idx
  on app.prijava_klasifikacija (kreirana_at, id) where status = 'na_cekanju';

-- Accuracy reporting: agreement rate per proposed response, over settled rows.
create index prijava_klasifikacija_ishod_idx
  on app.prijava_klasifikacija (ishod, predlozeni_tip_obrade) where ishod is not null;

comment on table app.prijava_klasifikacija is
  'Automatic triage proposal for a citizen report. Advisory only: app.prijava stays the record, and ishod says whether the dispatcher agreed.';
comment on column app.prijava_klasifikacija.signali is
  'Context the proposal was grounded in (nearest container, coverage, black spot). Written by the API, not by the model.';

-- Same lockdown as every other table in this schema (20260918120800_lockdown):
-- the API connects as owner, nothing else gets in.
alter table app.prijava_klasifikacija enable row level security;
revoke all on app.prijava_klasifikacija from anon, authenticated, service_role;
