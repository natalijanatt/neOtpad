-- The baseline schedule, outbound messaging, and the incentive scheme.

-- The fixed schedule this whole system exists to replace. It stays, because
-- "when does the truck come" must have an answer for settlements that have no
-- sensors, and because it is the fallback when optimisation is unavailable.
create table app.plan_odvoza (
  id             uuid primary key default gen_random_uuid(),
  naselje_id     uuid not null references app.naselje(id),
  tip_otpada     app.tip_otpada not null,
  dan_u_nedelji  smallint not null check (dan_u_nedelji between 1 and 7),
  vazi_od        date not null default current_date,
  vazi_do        date
);

create index plan_odvoza_naselje_idx on app.plan_odvoza (naselje_id, dan_u_nedelji);

create table app.pretplata (
  id            uuid primary key default gen_random_uuid(),
  gradjanin_id  uuid references app.gradjanin(id),
  -- A phone number with no citizen record is valid: somebody can subscribe over
  -- SMS without ever creating an account, which is the point.
  telefon_e164  text,
  naselje_id    uuid not null references app.naselje(id),
  kanal         app.kanal_prijave not null,
  tip           text not null,   -- dolazak_kamiona | promena_rasporeda | akcije
  aktivna       boolean not null default true,
  check (gradjanin_id is not null or telefon_e164 is not null)
);

create table app.obavestenje (
  id            uuid primary key default gen_random_uuid(),
  kanal         app.kanal_prijave not null,
  primalac      text not null,   -- E.164, or a reference to an intermediary
  gradjanin_id  uuid references app.gradjanin(id),
  posrednik_id  uuid references app.posrednik(id),
  tip           text not null,
  sadrzaj       text not null,
  zakazano_za   timestamptz,
  poslato_at    timestamptz,
  status        text not null default 'na_cekanju',
  eksterni_id   text,
  greska        text
);

-- The dispatcher's queue: what is due and not yet sent.
create index obavestenje_za_slanje_idx
  on app.obavestenje (zakazano_za) where poslato_at is null;

-- A ledger rather than a counter. The village competition scores a time window,
-- and a mutable total cannot be recomputed for last month.
create table app.bod_transakcija (
  id                  uuid primary key default gen_random_uuid(),
  gradjanin_id        uuid references app.gradjanin(id),
  mesna_zajednica_id  uuid references app.mesna_zajednica(id),
  razlog              text not null,   -- potvrdjena_prijava | ucesce_u_akciji | razvrstavanje
  bodovi              integer not null,
  prijava_id          uuid references app.prijava(id),
  akcija_id           uuid references app.akcija_ciscenja(id),
  nastalo_at          timestamptz not null default now()
);

create index bod_transakcija_mz_idx on app.bod_transakcija (mesna_zajednica_id, nastalo_at desc);

create table app.rezultat_takmicenja (
  id                  uuid primary key default gen_random_uuid(),
  mesna_zajednica_id  uuid not null references app.mesna_zajednica(id),
  period              daterange not null,
  -- Measurable indicators only: new dumps, recurrence at cleaned sites,
  -- confirmed-report rate. Rewards are community-level, so the subject is the
  -- mesna zajednica and never a person.
  indikatori          jsonb not null,
  skor                numeric(8,3) not null,
  rang                integer,
  unique (mesna_zajednica_id, period)
);
