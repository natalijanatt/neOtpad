-- Photos for citizen reports get a home: a public Supabase Storage bucket,
-- written over the S3 protocol.
--
-- This is a deliberate exception to "Supabase is a database and nothing else",
-- and a narrow one: no browser ever holds a storage key. Bytes go through the
-- NestJS API, which is still the only client of this project, and the generated
-- contract is still the only thing the frontend sees. What lands here is a key
-- and a URL, never an image.

alter table app.prijava_foto
  -- Staged upload: the photo arrives BEFORE the report exists. An anonymous
  -- reporter never learns the report id -- only `kratki_kod`, which is not a
  -- credential and therefore must never become a write capability. So a photo
  -- is uploaded unattached and claimed by the submission that follows.
  alter column prijava_id drop not null;

alter table app.prijava_foto
  -- What the frontend renders. Derivable from `kljuc`, stored anyway because
  -- that is the address the client needs; `kljuc` stays the canonical handle,
  -- and is the only thing that still works if the bucket is ever renamed.
  add column javni_url      text not null,
  -- The sniffed type, never the Content-Type the client claimed.
  add column mime_tip       text not null,
  add column velicina_bajt  integer not null,
  add column sha256         text not null,
  add column otpremljena_at timestamptz not null default now(),
  -- Without an expiry every abandoned upload stays in the bucket forever.
  -- Set on upload, cleared the moment a report claims the photo.
  add column istice_at      timestamptz;

alter table app.prijava_foto
  add constraint prijava_foto_kljuc_uniq unique (kljuc),
  -- A row is either attached to a report, or temporary and due to expire.
  -- There is no third state, and an unattached row with no expiry would be a
  -- permanent orphan the cleanup job can never see.
  add constraint prijava_foto_staged_istice
    check (prijava_id is not null or istice_at is not null),
  add constraint prijava_foto_velicina_pozitivna
    check (velicina_bajt > 0);

create index prijava_foto_prijava_idx on app.prijava_foto (prijava_id);

-- Drives the cleanup sweep, which only ever looks at unclaimed rows.
create index prijava_foto_istekle_idx on app.prijava_foto (istice_at)
  where prijava_id is null;

comment on column app.prijava_foto.kljuc is
  'Object key in the storage bucket: prijave/{yyyy}/{mm}/{uuid}.{ext}. Server-generated; the client filename is never used.';
comment on column app.prijava_foto.istice_at is
  'Staged-upload expiry. Null once a report has claimed the photo.';
