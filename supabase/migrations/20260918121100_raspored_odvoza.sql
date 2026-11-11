-- What the published collection schedule actually looks like, as opposed to what
-- `plan_odvoza` was able to express.
--
-- Three things the real schedule does that a weekday alone cannot say:
--
--   1. It is fortnightly. JP Komunalac's 2026 schedule reads "SVAKI DRUGI
--      PONEDELJAK", and for Selo Izvor and Selo Krupac "SVAKE ČETVRTE SREDE" —
--      villages get the recycling bin half as often as the city. Storing only
--      `dan_u_nedelji` would promise a citizen a truck on a Monday it never comes.
--   2. It is per street, not per settlement. Pirot's ~200 streets are split
--      across ten weekday-and-week groups.
--   3. It is a source with a date, like every other input here.

-- The blue bin is dry recyclables except glass (LPUO 2021-2031, t. 6.6.1: the
-- "two bins" system — blue for dry, green for wet, yellow containers for glass).
-- That is a stream in its own right: it is neither `komunalni` nor any single
-- material, because paper, plastic and metal travel together to the separation
-- line at the regional landfill.
alter type app.tip_otpada add value if not exists 'suvi_reciklabilni';

alter table app.plan_odvoza
  -- Street or part of a settlement. NULL means the schedule covers the whole
  -- settlement, which is how every village row arrives.
  add column zona text,
  -- 7 = weekly, 14 = every second week, 28 = every fourth.
  add column ciklus_dana smallint not null default 7
    check (ciklus_dana in (7, 14, 21, 28)),
  -- One known collection date, which anchors the cycle. Every later date is this
  -- one plus a whole number of cycles; without it "every second Monday" has two
  -- possible readings and half of them are wrong.
  add column referentni_datum date,
  add column izvor text,
  add column izvor_url text;

alter table app.plan_odvoza
  add constraint ciklus_ima_sidro
    check (ciklus_dana = 7 or referentni_datum is not null),
  -- A reference date that falls on a different weekday than the row claims is a
  -- transcription error, and it is silent until a citizen waits for a truck.
  add constraint sidro_pada_na_taj_dan
    check (referentni_datum is null
           or extract(isodow from referentni_datum) = dan_u_nedelji);

create index plan_odvoza_zona_idx on app.plan_odvoza (naselje_id, zona);

comment on table app.plan_odvoza is
  'The fixed published schedule this system exists to improve on. One row per settlement or street per waste stream.';
