-- Applied by `supabase db reset`. Enough reference data to run the API and the
-- demo; the historical datasets come in through the CSV importers instead,
-- because those carry precision flags and merge reasoning that a seed file would
-- quietly flatten.
--
-- Coordinates and place codes below are real, taken from
-- waste-scraper/data/pirot_sepa_registar_2018_2024.csv.

insert into app.mesna_zajednica (id, naziv) values
  ('11111111-1111-4111-8111-111111111111', 'Pirot - centar'),
  ('22222222-2222-4222-8222-222222222222', 'Krupac'),
  ('33333333-3333-4333-8333-333333333333', 'Sukovo')
on conflict do nothing;

-- Four settlements, enough to boot the API. The full list of 72, with the
-- coverage flag taken from JP Komunalac's own collection plan, arrives through
-- `npm run import:naselja` — see docs/data-sources.md. All four below are in
-- that plan, so the flags here are read off a document rather than guessed.
insert into app.naselje
  (id, naziv, sifra_mesta, mesna_zajednica_id, centroid, broj_domacinstava, organizovano_prikupljanje)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'Pirot', '732575',
   '11111111-1111-4111-8111-111111111111',
   extensions.st_point(22.5860, 43.1531)::extensions.geography, 12091, 'da'),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'Krupac', '732397',
   '22222222-2222-4222-8222-222222222222',
   extensions.st_point(22.675066, 43.116004)::extensions.geography, 441, 'da'),
  ('aaaaaaaa-0003-4000-8000-000000000003', 'Sukovo', null,
   '33333333-3333-4333-8333-333333333333',
   extensions.st_point(22.650082, 43.048063)::extensions.geography, 247, 'da'),
  ('aaaaaaaa-0004-4000-8000-000000000004', 'Gnjilan', '732222',
   '11111111-1111-4111-8111-111111111111',
   extensions.st_point(22.5479, 43.1697)::extensions.geography, 802, 'da')
on conflict do nothing;

-- The scraped reports spell this village two different ways. Import resolves
-- through the alias table so neither spelling creates a second settlement.
insert into app.naselje_alias (naselje_id, alias, izvor) values
  ('aaaaaaaa-0003-4000-8000-000000000003', 'selo sukovo', 'EKOALERT'),
  ('aaaaaaaa-0003-4000-8000-000000000003', 'Sukovo', 'EKOALERT')
on conflict do nothing;

-- Why a year-over-year dump count may not be drawn as a trend line.
--
-- Matched on grupa_uporedivosti rather than `on conflict`: the table's primary
-- key is a generated uuid and nothing else is unique, so a conflict clause can
-- never fire and re-running this file against a live database silently
-- duplicates every series.
insert into app.izvorna_serija (izvor, godina_od, godina_do, grupa_uporedivosti, napomena)
select v.izvor, v.godina_od, v.godina_do, v.grupa_uporedivosti, v.napomena
from (values
  ('SEPA/NRIZ', 2018, 2018, 'nriz-2018',
   'Pirot rows exist only for 2018 and none of these locations reappear later. The reporting method changed; the dumps did not disappear.'),
  ('SEPA/NRIZ', 2019, 2024, 'nriz-2019-2024',
   'Continuous annual registry entries. Comparable within this range only.'),
  ('EKOALERT', 2024, 2026, 'ekoalert',
   'Citizen reports. Counts reflect reporting activity, not dump formation, and are never comparable with registry counts.'),
  -- Also inserted by the migration that opened this path, because the hosted
  -- database is never re-seeded. Kept here so a reset produces the same table.
  ('PRIJAVA', 2026, 2026, 'prijave-sistem',
   'Citizen reports through this system. The count grows with app adoption, not with dump formation, and is never comparable with registry counts.')
) as v (izvor, godina_od, godina_do, grupa_uporedivosti, napomena)
where not exists (
  select 1 from app.izvorna_serija s where s.grupa_uporedivosti = v.grupa_uporedivosti
);

-- One sensored collection point, so ingest and the fill curve have something to
-- run against before any hardware exists.
insert into app.sabirno_mesto (id, naselje_id, naziv, lokacija, broj_domacinstava)
values ('bbbbbbbb-0001-4000-8000-000000000001',
        'aaaaaaaa-0002-4000-8000-000000000002',
        'Krupac - centar sela',
        extensions.st_point(22.675066, 43.116004)::extensions.geography, 48)
on conflict do nothing;

insert into app.kontejner (id, oznaka, sabirno_mesto_id, tip_otpada, zapremina_l)
values ('cccccccc-0001-4000-8000-000000000001', 'PI-KRU-004',
        'bbbbbbbb-0001-4000-8000-000000000001', 'komunalni', 1100)
on conflict do nothing;

insert into app.uredjaj (id, dev_eui, model, proizvodjac)
values ('dddddddd-0001-4000-8000-000000000001', 'eui-70b3d57ed0060a1c',
        'ultrasonic-fill-v1', 'nepoznat')
on conflict do nothing;

-- The depth the fill percentage is computed from. Measured at installation;
-- there is no data source that provides it.
insert into app.uredjaj_montaza
  (uredjaj_id, kontejner_id, konfigurisana_dubina_cm, montiran_od)
values ('dddddddd-0001-4000-8000-000000000001',
        'cccccccc-0001-4000-8000-000000000001', 180, now() - interval '30 days')
on conflict do nothing;

insert into app.vozilo (oznaka, kapacitet_m3, depo)
values ('JKP-01', 16.0, extensions.st_point(22.5860, 43.1531)::extensions.geography),
       ('JKP-02', 16.0, extensions.st_point(22.5860, 43.1531)::extensions.geography)
on conflict do nothing;

-- State for the one sensored point above, so it has something to route
-- against. Not tagged like the block below: this container is the original
-- reference point, not demo data added for a routing test.
insert into app.kontejner_stanje (kontejner_id, fill_percent, measured_at, aktivni_status)
values ('cccccccc-0001-4000-8000-000000000001', 85, now() - interval '2 hours', '{}')
on conflict do nothing;

-- Demo collection points, so a route plan has decisions to make before real
-- sensors exist. Every id and label below is tagged so this block can be found
-- and removed as a unit once it is not needed:
--   * every id starts with the hex-valid, still-readable prefix `5eed`
--     (`where id::text like '5eed%'` on sabirno_mesto/kontejner finds them all;
--     kontejner_stanje's key IS a kontejner_id, so it comes along for free)
--   * every naziv/oznaka is prefixed `SEED_` / `SEED-`, for the UI and reports
-- Each point exercises a different branch of the priority function
-- (docs/routing-heuristic.md); naselje_id values are real settlements already
-- in the gazetteer, coordinates are their centroids nudged apart.
insert into app.sabirno_mesto (id, naselje_id, naziv, lokacija, broj_domacinstava)
values
  ('5eed0000-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001',
   'SEED_Pirot - Tijabara, pijaca',
   extensions.st_point(22.5912, 43.1558)::extensions.geography, 120),
  ('5eed0000-0003-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001',
   'SEED_Pirot - Pazar, kod skole',
   extensions.st_point(22.5801, 43.1497)::extensions.geography, 90),
  ('5eed0000-0004-4000-8000-000000000004', 'aaaaaaaa-0003-4000-8000-000000000003',
   'SEED_Sukovo - centar',
   extensions.st_point(22.650082, 43.048063)::extensions.geography, 35),
  ('5eed0000-0005-4000-8000-000000000005', 'aaaaaaaa-0004-4000-8000-000000000004',
   'SEED_Gnjilan - raskrsnica',
   extensions.st_point(22.5479, 43.1697)::extensions.geography, 60)
on conflict do nothing;

insert into app.kontejner (id, oznaka, sabirno_mesto_id, tip_otpada, zapremina_l)
values
  ('5eed1000-0002-4000-8000-000000000002', 'SEED-PI-TIJ-001', '5eed0000-0002-4000-8000-000000000002', 'komunalni', 1100),
  ('5eed1000-0003-4000-8000-000000000003', 'SEED-PI-TIJ-002', '5eed0000-0002-4000-8000-000000000002', 'suvi_reciklabilni', 1100),
  ('5eed1000-0004-4000-8000-000000000004', 'SEED-PI-PAZ-001', '5eed0000-0003-4000-8000-000000000003', 'komunalni', 1100),
  ('5eed1000-0005-4000-8000-000000000005', 'SEED-PI-SUK-001', '5eed0000-0004-4000-8000-000000000004', 'komunalni', 1100),
  ('5eed1000-0006-4000-8000-000000000006', 'SEED-PI-GNJ-001', '5eed0000-0005-4000-8000-000000000005', 'komunalni', 1100)
on conflict do nothing;

-- Current state, as ingest would have left it:
--   Tijabara  92 % / 40 %, reliable     -> must-visit; the second container rides along
--   Pazar     45 %, reliable            -> optional; only if it is on the way
--   Sukovo    98 % with blocked optics  -> NOT a routing signal, a maintenance task
--   Gnjilan   no sensor, never emptied  -> climbs on its collection cycle alone
insert into app.kontejner_stanje (kontejner_id, fill_percent, measured_at, aktivni_status)
values
  ('5eed1000-0002-4000-8000-000000000002', 92, now() - interval '1 hour', '{ok}'),
  ('5eed1000-0003-4000-8000-000000000003', 40, now() - interval '1 hour', '{}'),
  ('5eed1000-0004-4000-8000-000000000004', 45, now() - interval '3 hours', '{}'),
  ('5eed1000-0005-4000-8000-000000000005', 98, now() - interval '1 hour', '{optics_blocked}')
on conflict do nothing;

-- A container with a kontejner_stanje row that came from somewhere: these four
-- have a device actually mounted (Sukovo's included — the device exists, it is
-- just reporting a fault). Gnjilan deliberately gets none, which is the whole
-- point of that point: 'bez_senzora' fires only where there really is no unit.
insert into app.uredjaj (id, dev_eui, model, proizvodjac)
values
  ('5eed2000-0002-4000-8000-000000000002', 'SEED_eui-tij-001', 'ultrasonic-fill-v1', 'nepoznat'),
  ('5eed2000-0003-4000-8000-000000000003', 'SEED_eui-tij-002', 'ultrasonic-fill-v1', 'nepoznat'),
  ('5eed2000-0004-4000-8000-000000000004', 'SEED_eui-paz-001', 'ultrasonic-fill-v1', 'nepoznat'),
  ('5eed2000-0005-4000-8000-000000000005', 'SEED_eui-suk-001', 'ultrasonic-fill-v1', 'nepoznat')
on conflict do nothing;

insert into app.uredjaj_montaza (uredjaj_id, kontejner_id, konfigurisana_dubina_cm, montiran_od)
values
  ('5eed2000-0002-4000-8000-000000000002', '5eed1000-0002-4000-8000-000000000002', 180, now() - interval '60 days'),
  ('5eed2000-0003-4000-8000-000000000003', '5eed1000-0003-4000-8000-000000000003', 180, now() - interval '60 days'),
  ('5eed2000-0004-4000-8000-000000000004', '5eed1000-0004-4000-8000-000000000004', 180, now() - interval '60 days'),
  ('5eed2000-0005-4000-8000-000000000005', '5eed1000-0005-4000-8000-000000000005', 150, now() - interval '60 days')
on conflict do nothing;

-- Demo news, so the citizen feed has something to show before anyone publishes.
-- Same removable-as-a-unit convention as the collection points above: every id
-- starts with `5eed` (`where id::text like '5eed%'` finds them all). Unlike the
-- blocks above the text is NOT prefixed SEED_, because these rows are read by a
-- human in the UI and a marker in the headline would be the first thing a juror
-- sees.
--
-- Between them they cover every branch the feed has: pinned and not, a
-- settlement post and a municipality-wide one, every category, and both states
-- of sms_tekst -- set (the post also goes out to phones without internet) and
-- null (it stays in the app on purpose). Every sms_tekst below is ASCII, which
-- is what keeps it to one 160-character message rather than three
-- (docs/news-feed.md).
insert into app.vest
  (id, naslov, sadrzaj, kategorija, naselje_id, zakacena, sms_tekst, autor, objavljena_at)
values
  ('5eed3000-0001-4000-8000-000000000001',
   'Izmena rasporeda odvoza za Krupac',
   E'Od ponedeljka kamion u Krupac dolazi sredom umesto cetvrtkom, u terminu 07:00-10:00.\n\nRazlog je novi raspored po kojem jedno vozilo pokriva Krupac i Veliko Selo, pa se ruta skracuje za oko 18 km. Kese i kante iznesite do 07:00.',
   'raspored', 'aaaaaaaa-0002-4000-8000-000000000002', true,
   'Od ponedeljka odvoz u Krupcu je SREDOM 07-10h umesto cetvrtkom. JKP Komunalac Pirot.',
   'JKP Komunalac Pirot', now() - interval '2 days'),

  ('5eed3000-0002-4000-8000-000000000002',
   'Nemate pametni telefon? Prijavite SMS-om ili preko predsednika MZ',
   E'Prepun kontejner i divlju deponiju mozete prijaviti i bez aplikacije:\n\n- SMS ili Viber na 065/123-456 - napisite naselje i sta je problem.\n- Preko predsednika mesne zajednice ili skole - oni prijavu unose umesto vas.\n\nNa svaku prijavu stize kratki kod kojim mozete pitati sta se dalje desava sa njom.',
   'obavestenje', null, true,
   'Prijava otpada bez aplikacije: SMS/Viber na 065/123-456 (napisite naselje i problem) ili preko predsednika MZ.',
   'JKP Komunalac Pirot', now() - interval '9 days'),

  ('5eed3000-0003-4000-8000-000000000003',
   'Akcija ciscenja u Sukovu - subota od 9 casova',
   E'U saradnji sa mesnom zajednicom Sukovo u subotu cistimo deponiju kod starog mosta, koja se posle svakog uklanjanja ponovo stvara.\n\nJKP obezbedjuje kese, rukavice, traktor i kontejner za kabasti otpad. Posle akcije na to mesto se postavlja kontejner od 1100 l - bez njega se otpad vraca za mesec dana.\n\nUcesce nosi bodove za takmicenje "Najcistije selo meseca".',
   'akcija', 'aaaaaaaa-0003-4000-8000-000000000003', false,
   'Akcija ciscenja u Sukovu, subota u 9h kod starog mosta. Kese i rukavice obezbedjene. MZ Sukovo i JKP.',
   'Odeljenje za zastitu zivotne sredine', now() - interval '1 day'),

  ('5eed3000-0004-4000-8000-000000000004',
   'Plava i zelena kanta: sta ide gde',
   E'U plavu kantu ide suvi reciklabilni otpad - papir, karton, plastika i limenke, sve suvo i ispraznjeno.\n\nStaklo NE ide u plavu kantu: za njega su zuti kontejneri od 1100 l kod pijace i kod Doma zdravlja.\n\nU zelenu kantu ide sve ostalo - ostaci hrane, pelene, pepeo kada se ohladi.',
   'edukacija', null, false,
   'Plava kanta: papir, plastika, limenke (suvo). Staklo ide u zute kontejnere. Zelena kanta: sve ostalo.',
   'JKP Komunalac Pirot', now() - interval '4 days'),

  ('5eed3000-0005-4000-8000-000000000005',
   'Novi kontejner u Pirotu, kod skretanja za groblje',
   E'Na mestu gde se otpad godinama ostavljao pored puta postavljen je kontejner od 1100 l. Lokacija je izabrana po evidenciji divljih deponija - prijave su odatle stizale svake godine.\n\nAko se kontejner puni brze nego sto kamion stize, prijavite nam: raspored se menja prema stvarnoj popunjenosti, a ne prema kalendaru.',
   'obavestenje', 'aaaaaaaa-0001-4000-8000-000000000001', false,
   null,
   'JKP Komunalac Pirot', now() - interval '7 days')
on conflict do nothing;

-- Demo collectors, so the "nobody on the map takes this" popup has someone to
-- show. Ids start with `5eed` like every demo block above. The names and phone
-- numbers are DEMO values made up for the hackathon, not real collectors —
-- replace them with real, consenting collectors before any public use, since
-- the popup offers a tap-to-call link.
insert into app.sakupljac (id, ime, prezime, telefon_e164, materijali)
values
  ('5eed4000-0001-4000-8000-000000000001', 'Dragan', 'Stojanović', '+381637214583',
   '{metal,elektronski,baterije}'),
  ('5eed4000-0002-4000-8000-000000000002', 'Milica', 'Jovanović', '+381658402917',
   '{iverica,drvo,kabasti}'),
  ('5eed4000-0003-4000-8000-000000000003', 'Nenad', 'Ilić', '+381612398745',
   '{metal,gume}'),
  ('5eed4000-0004-4000-8000-000000000004', 'Jelena', 'Petrović', '+381694417302',
   '{tekstil}'),
  ('5eed4000-0005-4000-8000-000000000005', 'Zoran', 'Ristić', '+381642875196',
   '{gradjevinski,drvo}')
on conflict do nothing;

-- Real drop-off sites for the citizen map. Real reference data, so no `5eed`
-- prefix — but only what could be sourced, which on 2026-09-19 was two places.
-- No recycling yard, e-waste or battery point in Pirot could be verified (the
-- recycling yard has a site but was still at project stage in 2023); a pin
-- without a source sends a person to a place that may not exist.
--
-- KROLUKS: street only, no house number in the listing → geocoded to the
-- street with OpenStreetMap Nominatim, hence 'geokodirano'.
-- Landfill: no coordinates published; the LPUO gives "4,5 km SZ od centra",
-- and the point is that bearing and distance from the city centre. The address
-- says "približno" so nobody takes the pin for the gate.
insert into app.mesto_odlaganja
  (id, naziv, tip, adresa, lokacija, geo_preciznost, radno_vreme, prima, materijali, izvor)
values
  ('f0000000-0001-4000-8000-000000000001',
   'Otkup i prodaja sekundarnih sirovina KROLUKS', 'otkup_sirovina',
   'Vojvode Mišića, Pirot',
   extensions.st_point(22.5837901, 43.1613779)::extensions.geography, 'geokodirano', null,
   '{bakar,gvožđe,aluminijum,mesing,olovo,"otkup akumulatora"}', '{metal,baterije}',
   'PTT imenik Srbije: https://www.pttimenik.com/sekundarne-sirovine-pirot/otkup-i-prodaja-sekundarnih-sirovina-kroluks (preuzeto 2026-09-19)'),
  ('f0000000-0002-4000-8000-000000000002',
   'JKP „Regionalna deponija Pirot“', 'deponija',
   'kp 277 KO Pirot-van varoš, oko 4,5 km SZ od centra (približna lokacija)',
   extensions.st_point(22.5469, 43.1818)::extensions.geography, 'geokodirano', null,
   '{"mešani komunalni otpad"}', '{}',
   'LPUO Pirot 2021-2031, waste-scraper/IZVORI.md §2 (lokacija: 4,5 km SZ od centra, kp 277 KO Pirot-van varoš)')
on conflict do nothing;
