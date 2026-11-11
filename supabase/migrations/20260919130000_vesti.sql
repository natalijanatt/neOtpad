-- News the utility publishes for citizens: schedule changes, clean-up actions,
-- sorting guidance.
--
-- This is an outbound channel, and the constraint from CLAUDE.md applies to it
-- exactly as it applies to reporting: a village without smartphones has to get
-- the same news. `sms_tekst` is that path, stored next to the post rather than
-- derived from it, because "kamion u sredu umesto u cetvrtak" written for a
-- keypad is not the first 160 characters of the web text.

create type app.kategorija_vesti as enum ('obavestenje', 'akcija', 'raspored', 'edukacija');

create table app.vest (
  id                  uuid primary key default gen_random_uuid(),
  naslov              text not null,
  sadrzaj             text not null,
  -- A URL, not an upload: object storage is off (Supabase is a database here),
  -- and prijava_foto has the same open question. Until an upload endpoint
  -- exists, an admin pastes a link.
  slika_url           text,
  kategorija          app.kategorija_vesti not null default 'obavestenje',
  -- NULL is the whole municipality, and it is the common case. A settlement
  -- post is still readable by everyone; the column filters a feed, it does not
  -- restrict access.
  naselje_id          uuid references app.naselje(id),
  -- Pinned posts sort above newer ones. A schedule change has to survive a week
  -- of other news, which a date-only order cannot express.
  zakacena            boolean not null default false,
  sms_tekst           text,
  -- The signature citizens see: a service, not the person who typed it. Who
  -- typed it is objavio_korisnik_id, which is not exposed in any response.
  autor               text not null,
  objavio_korisnik_id uuid references app.korisnik(id),
  objavljena_at       timestamptz not null default now(),
  -- NULL until the first edit: "never changed" and "changed at publication
  -- time" are different facts, and the feed shows the difference.
  azurirana_at        timestamptz,
  verzija             integer not null default 1,

  constraint vest_naslov_valid check (length(btrim(naslov)) between 3 and 200),
  constraint vest_sadrzaj_valid check (length(btrim(sadrzaj)) between 3 and 5000),
  constraint vest_autor_valid check (length(btrim(autor)) between 2 and 120),
  constraint vest_verzija_valid check (verzija > 0),
  constraint vest_azurirana_valid check (azurirana_at is null or azurirana_at >= objavljena_at),

  -- One SMS, not three. A GSM-7 message holds 160 characters, but a single
  -- c/ć/š/ž/đ forces UCS-2 and the limit drops to 70 — so the same sentence is
  -- one message without diacritics and three with them. The utility pays per
  -- message and per settlement, so the limit is a constraint rather than a
  -- guideline, and the two cases are checked separately.
  constraint vest_sms_valid check (
    sms_tekst is null
    or (length(btrim(sms_tekst)) >= 3
        and length(sms_tekst) <= case when sms_tekst ~ '^[\x0A\x0D\x20-\x7E]*$' then 160 else 70 end)
  )
);

-- Exactly the feed order the API serves, so the list endpoint never sorts in
-- memory: pinned first, then newest, with a stable UUID tie-breaker.
create index vest_feed_idx on app.vest (zakacena desc, objavljena_at desc, id desc);
create index vest_naselje_idx on app.vest (naselje_id) where naselje_id is not null;

comment on table app.vest is
  'Utility news for citizens. sms_tekst is the non-smartphone copy of the same post; NULL means the post stays in the app on purpose.';

-- Same lockdown as every other table in this schema (20260918120800_lockdown):
-- the API connects as owner, nothing else gets in.
alter table app.vest enable row level security;
revoke all on app.vest from anon, authenticated, service_role;
