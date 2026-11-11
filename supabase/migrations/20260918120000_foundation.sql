-- Foundation: extensions, the app schema, and every enum the domain uses.
--
-- Supabase is used here as a managed Postgres with PostGIS and a migration tool,
-- and nothing else: no Auth, no Storage, no Realtime, no PostgREST. The NestJS
-- API is the only client of this database, and the generated contract stays the
-- only thing the frontend sees.
--
-- Everything domain-related lives in the `app` schema, which is deliberately not
-- among config.toml's exposed schemas. That costs nothing today and means a
-- later change of mind about PostgREST cannot expose the tables by default.

create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;

comment on schema app is
  'Domain tables. Not exposed through PostgREST: the NestJS API is the only reader.';

-- ---------------------------------------------------------------------------
-- Enums
--
-- Native enums for sets that are closed by the domain rather than by taste.
-- Anything a utility clerk might extend next month (status strings, reasons) is
-- deliberately left as text, because altering an enum inside a migration is a
-- worse trade than a CHECK-free text column at this stage.
-- ---------------------------------------------------------------------------

create type app.tip_otpada as enum (
  'komunalni','pet','staklo','papir','metal','bio','kabasti','gradjevinski'
);

create type app.orijentacija as enum ('upright','tipped','emptying');

create type app.tip_alarma as enum (
  'pozar','prevrnut','optika_blokirana','baterija_niska','tisina','prelivanje'
);

create type app.tip_dogadjaja_kal as enum (
  'drzavni_praznik','slava','vasar','zetva','sezonski_radnici','povratnici','skolski_raspust'
);

-- Separates a surveyed registry point from a settlement centroid. Plotting the
-- two as equally precise invents locations that were never surveyed.
create type app.geo_preciznost as enum (
  'registarska_tacka','centroid_naselja','geokodirano','nepoznato'
);

-- The source data answers "does it recur?" with Da / Ne / blank. Blank is not
-- 'ne'; it is an absent answer and has to stay distinguishable.
create type app.trojstvo as enum ('da','ne','nepoznato');

create type app.pouzdanost_spajanja as enum ('visoka','srednja','niska');

create type app.kanal_prijave as enum ('sms','viber','web','mobilna','telefon','posrednik');

create type app.tip_prijave as enum (
  'pun_kontejner','prelivanje','divlja_deponija','ostecen_kontejner','nedostaje_kontejner','drugo'
);

-- An SMS carries no GPS. 'naselje' must remain a valid answer or the entire
-- rural reporting path is designed out of the system.
create type app.preciznost_lokacije as enum ('gps','opisana','naselje');

create type app.velicina_problema as enum ('mala','srednja','velika');

create type app.subjekat_rizika as enum ('kontejner','sabirno_mesto','kanonska_deponija','naselje');

create type app.uloga_korisnika as enum ('admin','dispecer','vozac');
