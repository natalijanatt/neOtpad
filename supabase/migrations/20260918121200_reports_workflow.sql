alter table app.prijava
  add column opis_lokacije text,
  add column tip_obrade text,
  add column verzija integer not null default 1,
  add column azurirana_at timestamptz not null default now(),
  add constraint prijava_status_valid check (status in ('nova', 'potvrdjena', 'odbijena', 'duplikat', 'resena')),
  add constraint prijava_verzija_valid check (verzija > 0),
  add constraint prijava_lokacija_valid check (num_nonnulls(tacka, naselje_id, kontejner_id) > 0),
  add constraint prijava_preciznost_valid check (
    (preciznost_lokacije <> 'gps' or tacka is not null)
    and (preciznost_lokacije <> 'naselje' or (naselje_id is not null and tacka is null))
  ),
  add constraint prijava_duplikat_valid check (
    (status = 'duplikat') = (duplikat_od is not null) and duplikat_od is distinct from id
  ),
  add constraint prijava_obrada_valid check (tip_obrade in ('odvoz', 'ciscenje', 'odrzavanje', 'provera_lokacije')),
  add constraint prijava_potvrda_valid check (
    status not in ('potvrdjena', 'resena') or (potvrdjena_at is not null and tip_obrade is not null)
  ),
  add constraint prijava_resenje_valid check (
    (status = 'resena') = (resena_at is not null)
    and (potvrdjena_at is null or potvrdjena_at >= primljena_at)
    and (resena_at is null or resena_at >= potvrdjena_at)
  ),
  add constraint prijava_odvoz_valid check (
    tip_obrade is distinct from 'odvoz'
    or (tip in ('pun_kontejner', 'prelivanje') and kontejner_id is not null and velicina is distinct from 'velika')
  );

create index prijava_queue_idx on app.prijava (status, primljena_at desc, id desc);
create index prijava_duplicate_idx on app.prijava (duplikat_od) where duplikat_od is not null;

create table app.prijava_istorija (
  id uuid primary key default gen_random_uuid(),
  prijava_id uuid not null references app.prijava(id),
  korisnik_id uuid references app.korisnik(id),
  akcija text not null check (akcija in ('kreirana', 'potvrdjena', 'odbijena', 'duplikat', 'resena')),
  razlog text,
  prethodno jsonb,
  novo jsonb not null,
  nastalo_at timestamptz not null default now(),
  verzija integer not null,
  unique (prijava_id, verzija)
);

create function app.prijava_istorija_nepromenljiva() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Report history is append-only';
end;
$$;

create trigger prijava_istorija_append_only
before update or delete on app.prijava_istorija
for each row execute function app.prijava_istorija_nepromenljiva();

create table app.prijava_zahtev (
  opseg text not null,
  kljuc uuid not null,
  sadrzaj_hash text not null,
  prijava_id uuid not null references app.prijava(id),
  kreiran_at timestamptz not null default now(),
  primary key (opseg, kljuc)
);

create table app.api_limit (
  kljuc text primary key,
  broj integer not null check (broj > 0),
  istice_at timestamptz not null
);
create index api_limit_expiry_idx on app.api_limit (istice_at);

create unique index korisnik_email_normalized_idx on app.korisnik (lower(email));

alter table app.prijava_istorija enable row level security;
alter table app.prijava_zahtev enable row level security;
alter table app.api_limit enable row level security;
revoke all on app.prijava_istorija, app.prijava_zahtev, app.api_limit from anon, authenticated, service_role;
