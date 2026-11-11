-- Local seasonality and fill forecasting.

-- The seasonality CLAUDE.md names explicitly, held as data rather than code: a
-- slava date differs per village, moves with the Orthodox calendar, and nobody
-- is going to redeploy the backend for it.
create table app.kalendarski_dogadjaj (
  id                  uuid primary key default gen_random_uuid(),
  naziv               text not null,
  tip                 app.tip_dogadjaja_kal not null,
  naselje_id          uuid references app.naselje(id),          -- NULL = the whole city
  mesna_zajednica_id  uuid references app.mesna_zajednica(id),
  datum_pocetka       date not null,
  datum_kraja         date not null,
  ponavljanje         text,          -- RRULE; a fixed date is not enough for movable feasts
  -- Multiplier on the waste generation rate. Seeded by hand from what the
  -- utility knows, refined against measurements once there are any.
  ocekivani_faktor    numeric(4,2) check (ocekivani_faktor > 0),
  izvor               text,
  napomena            text,
  check (datum_kraja >= datum_pocetka)
);

create index kalendarski_dogadjaj_period_idx
  on app.kalendarski_dogadjaj (datum_pocetka, datum_kraja);

create table app.prognoza_punjenja (
  id                uuid primary key default gen_random_uuid(),
  kontejner_id      uuid not null references app.kontejner(id) on delete cascade,
  izracunata_at     timestamptz not null default now(),
  horizont_do       timestamptz not null,
  -- Last reading that fed this forecast. Makes a stale forecast visible instead
  -- of letting it quietly look current.
  ulazni_podaci_do  timestamptz not null,
  -- [{t, p10, p50, p90}] — read as a whole by the UI, never queried into.
  serija            jsonb not null,
  -- ETA to the critical level. This is the column routing sorts on.
  vreme_kriticnog   timestamptz,
  -- Missing readings were present and were NOT interpolated away. A forecast
  -- built over a gap has to be able to say so.
  ima_rupu          boolean not null default false,
  model_verzija     text not null,
  pouzdanost        text not null default 'srednja'
);

create index prognoza_punjenja_kontejner_idx
  on app.prognoza_punjenja (kontejner_id, izracunata_at desc);

create index prognoza_punjenja_kriticno_idx
  on app.prognoza_punjenja (vreme_kriticnog)
  where vreme_kriticnog is not null;

comment on table app.prognoza_punjenja is
  'Forecasts are kept, never overwritten: yesterday''s prediction against today''s measurement is the only honest accuracy metric.';
