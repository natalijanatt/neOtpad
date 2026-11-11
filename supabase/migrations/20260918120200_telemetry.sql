-- Telemetry: the append-only reading log, the cached current state, alarms and
-- emptying events.
--
-- Column names here follow docs/sensor-telemetry.md, which documents the payload
-- in English. The naming rule in docs/domain-glossary.md is "follow the source",
-- and for these fields that page IS the source.

create table app.ocitavanje (
  id                      bigint generated always as identity,
  uredjaj_id              uuid not null references app.uredjaj(id),
  -- Resolved at ingest through the montaza valid at measured_at, then frozen.
  -- Denormalised on purpose: a device swap must not retroactively move history
  -- to a different container.
  kontejner_id            uuid not null references app.kontejner(id),
  -- Device clock. The only timestamp that belongs on a fill curve.
  measured_at             timestamptz not null,
  received_at             timestamptz not null default now(),
  distance_cm             integer not null,   -- the measurement
  fill_percent            smallint,           -- as computed and sent by the device
  -- Recomputed server-side from distance_cm and the depth configured on the
  -- montaza valid at measured_at. Every model reads this one, never the above.
  fill_percent_izracunat  smallint,
  temperature_c           numeric(4,1),
  orientation             app.orijentacija,
  battery_mv              integer,
  battery_percent         smallint,
  -- A list, because a unit can be both dirty and low on battery at once.
  status                  text[] not null default '{}',
  rssi                    integer,
  snr                     numeric(4,1),
  gateway_id              text,
  raw_payload             jsonb,
  -- A diagnostic code outranks the measurement: blocked optics read as a very
  -- short distance, i.e. "full". Generated so that no query can forget to check
  -- it — treating a faulty reading as a full container is the likeliest way this
  -- system sends a truck for nothing.
  pouzdano                boolean generated always as (
                            cardinality(status) = 0 or status = array['ok']::text[]
                          ) stored,
  primary key (id, measured_at),
  -- LoRaWAN store-and-forward retries are expected, not exceptional. Ingest is
  -- INSERT ... ON CONFLICT DO NOTHING against this.
  unique (uredjaj_id, measured_at)
) partition by range (measured_at);

create index ocitavanje_kontejner_idx on app.ocitavanje (kontejner_id, measured_at desc);

-- Monthly partitions. A helper rather than a cron job, so a backfill of old
-- data creates what it needs instead of failing on a missing partition.
create or replace function app.ensure_ocitavanje_particija(za timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pocetak date := date_trunc('month', za)::date;
  kraj    date := (date_trunc('month', za) + interval '1 month')::date;
  ime     text := format('ocitavanje_%s', to_char(pocetak, 'YYYY_MM'));
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = ime
  ) then
    execute format(
      'create table app.%I partition of app.ocitavanje for values from (%L) to (%L)',
      ime, pocetak, kraj
    );
  end if;
end;
$$;

-- Two years around the present is enough that nothing fails during a hackathon.
do $$
declare m int;
begin
  for m in -6..17 loop
    perform app.ensure_ocitavanje_particija(date_trunc('month', now()) + (m || ' months')::interval);
  end loop;
end;
$$;

-- One row per container, overwritten on ingest. The map and dashboard read this;
-- nothing scans ocitavanje to answer "how full is it right now".
create table app.kontejner_stanje (
  kontejner_id      uuid primary key references app.kontejner(id) on delete cascade,
  fill_percent      smallint,
  measured_at       timestamptz,
  trend_pp_po_danu  numeric(5,2),
  baterija_percent  smallint,
  aktivni_status    text[] not null default '{}',
  -- Prolonged silence is a data gap, not an empty container. An explicit column
  -- so the UI can show "no data" instead of a reassuring 0%.
  tih_od            timestamptz,
  azurirano_at      timestamptz not null default now()
);

create table app.alarm (
  id            uuid primary key default gen_random_uuid(),
  kontejner_id  uuid references app.kontejner(id),
  uredjaj_id    uuid references app.uredjaj(id),
  tip           app.tip_alarma not null,
  nastao_at     timestamptz not null default now(),
  potvrdjen_at  timestamptz,
  zatvoren_at   timestamptz,
  prioritet     smallint not null default 5,
  detalji       jsonb
);

-- Open alarms are the dispatcher's working set; the partial index keeps that
-- query cheap no matter how long the closed history grows.
create index alarm_otvoreni_idx on app.alarm (tip, nastao_at desc) where zatvoren_at is null;

comment on table app.alarm is
  'Fire (>70 C) never enters the nightly optimisation: the row is written and notifications fire immediately.';

-- Ground truth that a truck actually serviced the container, and the reset point
-- of every fill curve. Free, because the sensor reports "emptying" from tilt.
create table app.praznjenje (
  id                  uuid primary key default gen_random_uuid(),
  kontejner_id        uuid not null references app.kontejner(id),
  detektovano_at      timestamptz not null,
  izvor               text not null,   -- senzor_tilt | senzor_pad_nivoa | vozac | rucno
  -- FK added in the routing migration: that table does not exist yet.
  stajaliste_rute_id  uuid,
  unique (kontejner_id, detektovano_at)
);

create index praznjenje_kontejner_idx on app.praznjenje (kontejner_id, detektovano_at desc);
