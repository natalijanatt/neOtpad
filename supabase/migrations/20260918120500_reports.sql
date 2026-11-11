-- Citizen reports, the people who file them, and the staff who triage them.
--
-- This is the module where "do not assume a smartphone" either holds or quietly
-- breaks. Every nullable column below is nullable because an SMS cannot carry it.

-- Utility staff. Supabase Auth is not in use, so identities live here and the
-- NestJS guards read the role from a JWT this API issues itself.
create table app.korisnik (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  ime            text not null,
  uloga          app.uloga_korisnika not null,
  lozinka_hash   text not null,
  aktivan        boolean not null default true,
  kreiran_at     timestamptz not null default now()
);

create table app.gradjanin (
  id             uuid primary key default gen_random_uuid(),
  -- PII. Never appears in a response DTO; the public identifier of a report is
  -- its kratki_kod, not the reporter.
  telefon_e164   text unique,
  ime            text,
  naselje_id     uuid references app.naselje(id),
  kanal          app.kanal_prijave,
  saglasnost_at  timestamptz,
  -- Denormalised from bod_transakcija for display only. The ledger is the truth.
  bodovi         integer not null default 0
);

-- Local-community presidents, schools, health posts. Reporting through a person
-- is a first-class path rather than a workaround: it is how a village with no
-- smartphones participates at all.
create table app.posrednik (
  id                  uuid primary key default gen_random_uuid(),
  ime                 text not null,
  uloga               text not null,   -- predsednik_mz | skola | dom_zdravlja | drugo
  mesna_zajednica_id  uuid references app.mesna_zajednica(id),
  telefon_e164        text,
  aktivan             boolean not null default true
);

create table app.prijava (
  id                   uuid primary key default gen_random_uuid(),
  -- What an SMS reply can quote back, and what a citizen reads out over the
  -- phone. Short enough to type on a keypad.
  kratki_kod           text not null unique,
  kanal                app.kanal_prijave not null,
  gradjanin_id         uuid references app.gradjanin(id),
  posrednik_id         uuid references app.posrednik(id),
  tip                  app.tip_prijave not null,
  opis                 text,
  tacka                extensions.geography(Point,4326),
  naselje_id           uuid references app.naselje(id),
  -- An SMS has no GPS, so 'naselje' has to stay a valid answer. Requiring a
  -- point here would silently make the app the only way to report.
  preciznost_lokacije  app.preciznost_lokacije not null,
  kontejner_id         uuid references app.kontejner(id),
  kanonska_id          uuid references app.deponija_kanonska(id),
  -- Decides where it goes: a full container joins the next truck route, a large
  -- dump needs a dedicated crew and machinery. Different problems, different paths.
  velicina             app.velicina_problema,
  status               text not null default 'nova',
  duplikat_od          uuid references app.prijava(id),
  prioritet            numeric(6,2),
  primljena_at         timestamptz not null default now(),
  potvrdjena_at        timestamptz,
  resena_at            timestamptz,
  -- A report is either from a citizen, or relayed by an intermediary, or
  -- anonymous over SMS. What it cannot be is attributed to both at once.
  check (not (gradjanin_id is not null and posrednik_id is not null))
);

create index prijava_status_idx on app.prijava (status, primljena_at desc);
create index prijava_naselje_idx on app.prijava (naselje_id);
create index prijava_tacka_idx on app.prijava using gist (tacka);

create table app.prijava_foto (
  id            uuid primary key default gen_random_uuid(),
  prijava_id    uuid not null references app.prijava(id) on delete cascade,
  -- Object-store key. Where that store lives is still open: Supabase is used
  -- here for the database only, so photos need a home of their own.
  kljuc         text not null,
  snimljeno_at  timestamptz
);

-- Raw inbound SMS/Viber before parsing. Kept because keyword parsing will be
-- wrong at first, and the original text is the only way to find out how.
create table app.dolazna_poruka (
  id            uuid primary key default gen_random_uuid(),
  kanal         app.kanal_prijave not null,
  posiljalac    text not null,
  tekst         text not null,
  primljena_at  timestamptz not null default now(),
  prijava_id    uuid references app.prijava(id),
  obradjena     boolean not null default false,
  greska        text
);

create index dolazna_poruka_neobradjene_idx
  on app.dolazna_poruka (primljena_at) where not obradjena;
