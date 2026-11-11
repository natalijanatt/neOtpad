-- Sensors on containers, and the readings they produce.
--
-- No sensor is installed in Pirot yet, so no reading here is a measurement. What
-- this migration does instead is compute what a sensor *would* report, from what
-- the sources do state:
--
--   households served     app.sabirno_mesto.broj_domacinstava, split per container
--   container volume      app.kontejner.zapremina_l — 1100 L, documented
--   collection frequency  app.pokrivenost_naselja.odvoz_nedeljno — 1-3 per week
--   sensor depth          app.uredjaj_montaza.konfigurisana_dubina_cm
--   season                the day of the year, for temperature
--
-- One assumption carries the whole curve: how much waste a household puts out per
-- day. It is an argument of the function rather than a constant buried inside it,
-- and the comment on that argument says where the default comes from. Everything
-- else follows arithmetically, which is the point — a fill level in this database
-- can be explained by pointing at a document, and when the utility supplies a
-- better number the entire series is regenerated with one call.
--
-- What is deliberately NOT here: no fire, no tipped container, no blocked optics,
-- no dropped uplinks, no flat battery. Those are real device behaviours
-- (docs/sensor-telemetry.md) and the schema has a place for each, but writing one
-- in would put an incident in the record that never happened.
--
-- Overflow is the exception, because it is derived rather than staged: where the
-- documented household-to-container ratio cannot wait for the documented
-- collection day, the curve reaches 100 % on its own. Berilovac — 564 households,
-- 15 containers, twice a week — overflows for that reason, and that is a finding
-- about Pirot rather than a scenario written into the data.

-- ---------------------------------------------------------------------------
-- 1. Which containers get a sensor
-- ---------------------------------------------------------------------------
-- The rollout CLAUDE.md describes: shared points serving many households first,
-- and every settlement represented rather than only the dense core. Concretely
-- one sensor per village, a second where the documented load already exceeds what
-- the collection frequency can carry — that is where a sensor changes a decision
-- rather than confirming a routine — and in the city one per seventh street,
-- which spreads ~29 units over the 201 streets the schedule names.
create or replace function app.instaliraj_senzore(
  montirano_od timestamptz default date_trunc('day', now()) - interval '60 days',
  litara_dnevno_po_domacinstvu numeric default 15.0
)
-- The output columns are deliberately not named `oznaka` / `dev_eui`: a RETURNS
-- TABLE column is a variable in scope for the whole body, and either name would
-- shadow the identically named column inside the statements below.
returns table (kontejner text, senzor text, naselje text)
language plpgsql
set search_path = ''
as $$
declare
  -- Usable depth of a 1100 L four-wheel container with the sensor on the lid.
  -- Lives on the montaza and not on the container, because the device computes
  -- the percentage from the depth configured on that unit.
  dubina constant int := 110;
  ugradjeno int;
begin
  create temporary table izabrani (kontejner_id uuid primary key) on commit drop;

  insert into pg_temp.izabrani (kontejner_id)
  -- Villages: rank each settlement's containers by the households behind them.
  select v.kontejner_id
  from (
    select k.id as kontejner_id, k.oznaka,
           row_number() over (
             partition by n.id
             order by sm.broj_domacinstava desc nulls last, k.oznaka
           ) as mesto_u_naselju,
           -- Peak fill the documented numbers imply just before a collection.
           -- Over 100 the settlement is under-provisioned; that is not a modelling
           -- error, it is the reason the dumps are where they are.
           (100.0
             * (coalesce(sm.broj_domacinstava::numeric
                          / nullif((select count(*) from app.kontejner k2
                                     where k2.sabirno_mesto_id = sm.id
                                       and k2.uklonjen_datum is null), 0), 14)
                * litara_dnevno_po_domacinstvu
                * (7.0 / coalesce(pk.odvoz_nedeljno, 2)))
             / k.zapremina_l) as vrhunac
    from app.kontejner k
    join app.sabirno_mesto sm on sm.id = k.sabirno_mesto_id
    join app.naselje n on n.id = sm.naselje_id
    left join lateral (
      select p.odvoz_nedeljno from app.pokrivenost_naselja p
      where p.naselje_id = n.id and p.odvoz_nedeljno is not null
      order by p.godina desc limit 1
    ) pk on true
    where k.uklonjen_datum is null
      and coalesce(n.kategorija_naselja, '') <> 'grad'
  ) v
  where v.mesto_u_naselju = 1
     or (v.mesto_u_naselju = 2 and v.vrhunac > 100)
  union
  -- The city: the first container of every seventh street, by name, so the units
  -- are spread over the street list instead of clustered in one quarter.
  select g.kontejner_id
  from (
    select k.id as kontejner_id,
           row_number() over (partition by sm.id order by k.oznaka) as u_mestu,
           dense_rank() over (order by sm.naziv) as ulica
    from app.kontejner k
    join app.sabirno_mesto sm on sm.id = k.sabirno_mesto_id
    join app.naselje n on n.id = sm.naselje_id
    where k.uklonjen_datum is null
      and n.kategorija_naselja = 'grad'
  ) g
  where g.u_mestu = 1 and g.ulica % 7 = 1;

  -- Devices are numbered on from whatever already exists, so a later install
  -- continues the series rather than colliding with it. The prefix is the IEEE
  -- block the payload example in docs/sensor-telemetry.md uses; `model` stays a
  -- placeholder because the device is not chosen yet ("Not yet decided").
  with novi as (
    select i.kontejner_id,
           format('eui-70b3d57ed006%s',
                  lpad(to_hex((select count(*) from app.uredjaj)
                              + row_number() over (order by k.oznaka)), 4, '0')) as dev_eui
    from pg_temp.izabrani i
    join app.kontejner k on k.id = i.kontejner_id
    where not exists (
      select 1 from app.uredjaj_montaza m
      where m.kontejner_id = i.kontejner_id and m.montiran_do is null
    )
  ), ugradjen as (
    insert into app.uredjaj (dev_eui, model, proizvodjac, aktiviran)
    select n.dev_eui, 'ultrasonic-fill-v1', 'nepoznat', montirano_od::date
    from novi n
    on conflict (dev_eui) do nothing
    returning app.uredjaj.id, app.uredjaj.dev_eui
  )
  insert into app.uredjaj_montaza
    (uredjaj_id, kontejner_id, konfigurisana_dubina_cm, montiran_od)
  select u.id, n.kontejner_id, dubina, montirano_od
  from novi n
  join ugradjen u on u.dev_eui = n.dev_eui;

  get diagnostics ugradjeno = row_count;
  raise notice 'Senzori ugradjeni na % kontejner(a).', ugradjeno;

  return query
    select k.oznaka, u.dev_eui, n.naziv
    from app.uredjaj_montaza m
    join app.kontejner k on k.id = m.kontejner_id
    join app.uredjaj u on u.id = m.uredjaj_id
    join app.sabirno_mesto sm on sm.id = k.sabirno_mesto_id
    join app.naselje n on n.id = sm.naselje_id
    where m.montiran_do is null
    order by n.naziv, k.oznaka;
end;
$$;

comment on function app.instaliraj_senzore(timestamptz, numeric) is
  'Puts a device and a montaza on the containers the rollout prioritises: one per village, a second where the documented load outruns the collection frequency, one per seventh city street. Idempotent.';

-- ---------------------------------------------------------------------------
-- 2. The readings
-- ---------------------------------------------------------------------------
create or replace function app.generisi_ocitavanja(
  od timestamptz default date_trunc('day', now()) - interval '45 days',
  do_ timestamptz default date_trunc('hour', now()),
  korak interval default interval '6 hours',
  -- Litres per household per day — the one assumption in this file.
  --
  -- The utility's own sizing is the yardstick: containers x 1100 L x collections
  -- per week / (7 x households) is the capacity it planned for, and across the 23
  -- documented villages that lands between 8 and 23 L, median ~20. At 15 L a
  -- typically provisioned village is around three-quarters full when the truck
  -- arrives, and an under-provisioned one overflows before it does. It is also
  -- ~0,55 kg per person per day at 2,9 people per household and ~110 kg/m3 loose
  -- density — below the national urban figure, which is what a village where
  -- organic waste never reaches the container should look like.
  litara_dnevno_po_domacinstvu numeric default 15.0,
  -- The city's mixed-waste schedule is published nowhere (waste-scraper/IZVORI.md),
  -- so its frequency is an assumption. The villages' comes from the 2018 plan.
  odvoz_nedeljno_grad smallint default 6
)
returns table (kontejnera bigint, ocitavanja bigint, praznjenja bigint, prelivanja bigint)
language plpgsql
set search_path = ''
as $$
declare
  -- One LoRaWAN gateway at the city centre, where the utility's depot is. It is a
  -- planning assumption and not a deployed antenna: rssi/snr below are the
  -- log-distance estimate for that single placement, and their worth is precisely
  -- that they show which villages one gateway cannot reach.
  gateway constant text := 'gw-pirot-centar';
  antena extensions.geography;
  m int;
begin
  select n.centroid into antena
  from app.naselje n
  where n.kategorija_naselja = 'grad'
  limit 1;

  if antena is null then
    -- Pirot's centre, from waste-scraper/data/pirot_naselja.csv.
    antena := extensions.st_point(22.581273, 43.159784)::extensions.geography;
  end if;

  -- A backfill creates the partitions it needs instead of failing on them.
  for m in 0 .. (extract(year from do_)::int * 12 + extract(month from do_)::int)
                - (extract(year from od)::int * 12 + extract(month from od)::int) loop
    perform app.ensure_ocitavanje_particija(od + (m || ' months')::interval);
  end loop;

  create temporary table senzori (
    kontejner_id uuid primary key,
    uredjaj_id   uuid         not null,
    dev_eui      text         not null,
    oznaka       text         not null,
    dubina       int          not null,
    montiran_od  timestamptz  not null,
    pp_dnevno    numeric      not null,
    dani         int[]        not null,
    rssi         int          not null,
    snr          numeric(4,1) not null
  ) on commit drop;

  insert into pg_temp.senzori
  select
    k.id, m.uredjaj_id, u.dev_eui, k.oznaka, m.konfigurisana_dubina_cm, m.montiran_od,
    -- Percentage points per day: the litres a day behind this container, over its
    -- volume. Everything in this expression is a documented number.
    100.0 * (dom.po_kontejneru * litara_dnevno_po_domacinstvu) / k.zapremina_l,
    -- Collection weekdays. Only the frequency is documented, so the days are
    -- spread evenly through the week; which days they are changes no fill level,
    -- only the day the sawtooth resets on.
    case coalesce(pk.odvoz_nedeljno,
                  case when n.kategorija_naselja = 'grad' then odvoz_nedeljno_grad else 2 end)
      when 1 then array[4]
      when 2 then array[2, 5]
      when 3 then array[1, 3, 5]
      when 4 then array[1, 2, 4, 6]
      when 5 then array[1, 2, 3, 4, 5]
      when 6 then array[1, 2, 3, 4, 5, 6]
      else array[1, 2, 3, 4, 5, 6, 7]
    end,
    veza.rssi,
    -- LoRa demodulates well below the noise floor, so SNR is the figure that
    -- decides whether a village is reachable at all.
    least(12.0, greatest(-20.0, round((veza.rssi + 118)::numeric, 1)))
  from app.uredjaj_montaza m
  join app.kontejner k on k.id = m.kontejner_id
  join app.uredjaj u on u.id = m.uredjaj_id
  join app.sabirno_mesto sm on sm.id = k.sabirno_mesto_id
  join app.naselje n on n.id = sm.naselje_id
  left join lateral (
    select p.odvoz_nedeljno from app.pokrivenost_naselja p
    where p.naselje_id = n.id and p.odvoz_nedeljno is not null
    order by p.godina desc limit 1
  ) pk on true
  cross join lateral (
    select coalesce(
             sm.broj_domacinstava::numeric
               / nullif((select count(*) from app.kontejner k2
                          where k2.sabirno_mesto_id = sm.id and k2.uklonjen_datum is null), 0),
             14) as po_kontejneru
  ) dom
  cross join lateral (
    -- Log-distance path loss: -95 dBm at a kilometre, 25 dB per decade. Dojkinci
    -- at ~20 km is meant to read as marginal, because it is.
    -- st_distance returns double precision and log(numeric, numeric) is the only
    -- two-argument form, hence the cast.
    select greatest(-135, least(-70,
             round(-95 - 25 * log(10::numeric, greatest(
               extensions.st_distance(sm.lokacija, antena)::numeric / 1000.0, 0.1)))::int)) as rssi
  ) veza
  where m.montiran_do is null and k.uklonjen_datum is null;

  -- Regenerating is the normal case — the rate changes, the window moves — so the
  -- window is cleared first, scoped to the containers that carry a sensor and to
  -- the window itself. Nothing outside those two bounds is touched.
  delete from app.alarm a
  using pg_temp.senzori s
  where a.kontejner_id = s.kontejner_id
    and a.tip = 'prelivanje'
    and a.nastao_at >= od and a.nastao_at <= do_;

  delete from app.praznjenje p
  using pg_temp.senzori s
  where p.kontejner_id = s.kontejner_id
    and p.izvor = 'senzor_tilt'
    and p.detektovano_at >= od and p.detektovano_at <= do_;

  delete from app.ocitavanje o
  using pg_temp.senzori s
  where o.kontejner_id = s.kontejner_id
    and o.measured_at >= od and o.measured_at <= do_;

  -- The curve, in closed form: fill at t is the rate times the time since the last
  -- collection, capped where the container is full. A container cannot report more
  -- than full, which is exactly why overflow has to come from the forecast rather
  -- than from the reading — the reading saturates and stops telling you anything.
  with mreza as (
    select t from generate_series(od, do_, korak) as t
  ),
  odvozi as (
    -- Collection moments, 07:00 local. The grid reaches back a week so the first
    -- reading in the window already has a reset behind it.
    select s.kontejner_id,
           ((d::date + time '07:00') at time zone 'Europe/Belgrade') as prazno_at
    from pg_temp.senzori s
    -- Cast to timestamp explicitly: date arguments would leave the timestamp and
    -- timestamptz overloads of generate_series equally applicable.
    cross join generate_series(((od at time zone 'Europe/Belgrade')::date - 8)::timestamp,
                               ((do_ at time zone 'Europe/Belgrade')::date)::timestamp,
                               interval '1 day') as d
    where extract(isodow from d)::int = any (s.dani)
  ),
  tacke as (
    select s.kontejner_id, g.t, max(o.prazno_at) as prazno_at
    from pg_temp.senzori s
    cross join mreza g
    left join odvozi o
      on o.kontejner_id = s.kontejner_id and o.prazno_at <= g.t
    group by s.kontejner_id, g.t
  ),
  izracunato as (
    select
      s.*,
      p.t as measured_at,
      -- Hours of accumulation: since the last collection, or since installation
      -- for a container whose first collection is still ahead of it.
      extract(epoch from (p.t - coalesce(p.prazno_at, s.montiran_od))) / 3600.0 as sati,
      -- The reading landing in the step that follows a collection is the one the
      -- tilt sensor reports as 'emptying'. It is also the free ground truth that
      -- the planned round was actually driven.
      (p.prazno_at is not null and p.t - p.prazno_at < korak) as prazni,
      extract(doy from p.t at time zone 'Europe/Belgrade') as doy,
      extract(hour from p.t at time zone 'Europe/Belgrade') as cas,
      extract(epoch from (p.t - s.montiran_od)) / 86400.0 as dana_rada
    from tacke p
    join pg_temp.senzori s on s.kontejner_id = p.kontejner_id
  ),
  nivoi as (
    select
      i.*,
      least(100.0, greatest(0.0, i.pp_dnevno * i.sati / 24.0)) as nivo,
      -- Pirot's year: about 0 °C in January, 21 °C in July, with a daily swing
      -- peaking mid-afternoon. Inside a closed container, not in the shade.
      round((10.5 - 10.5 * cos(2 * pi() * (i.doy - 15) / 365.0)
             + 4 * sin(2 * pi() * (i.cas - 9) / 24.0))::numeric, 1) as temp_c,
      -- 3,65 V new to 3,40 V at five years, linear. Nothing in this window comes
      -- near a replacement visit; the column exists so the trend does.
      round(3650 - 250 * i.dana_rada / 1825.0)::int as mv
    from izracunato i
  ),
  red as (
    select
      n.*,
      d.distance_cm,
      -- The percentage is derived FROM the measurement rather than computed
      -- alongside it, so the two can never contradict each other. That matters at
      -- saturation: the sensor cannot report a distance of zero, so a container
      -- packed to the lid reads 2 cm and therefore 98 %, not 100 %. Deriving the
      -- percentage independently would store a reading whose own distance says
      -- something else.
      round(100.0 * (n.dubina - d.distance_cm) / n.dubina)::smallint as fill_percent,
      greatest(0, least(100, round(100.0 * (n.mv - 3400) / 250.0)))::smallint as battery_percent,
      case when n.prazni then 'emptying' else 'upright' end as orientation
    from nivoi n
    cross join lateral (
      select greatest(2, round(n.dubina * (1 - n.nivo / 100.0))::int) as distance_cm
    ) d
  )
  insert into app.ocitavanje
    (uredjaj_id, kontejner_id, measured_at, received_at, distance_cm,
     fill_percent, fill_percent_izracunat, temperature_c, orientation,
     battery_mv, battery_percent, status, rssi, snr, gateway_id, raw_payload)
  select
    r.uredjaj_id,
    r.kontejner_id,
    r.measured_at,
    -- Store-and-forward through the network server. Only measured_at belongs on a
    -- fill curve; received_at exists so the two can diverge.
    r.measured_at + interval '2 seconds',
    r.distance_cm,
    r.fill_percent,
    -- The device computes its percentage from the depth configured on it; the
    -- server recomputes from the depth on the montaza. The same number here
    -- because the configured depth is right — two columns so that correcting a
    -- depth can be reapplied to the history.
    r.fill_percent,
    r.temp_c,
    r.orientation::app.orijentacija,
    r.mv,
    r.battery_percent,
    array['ok'],
    r.rssi,
    r.snr,
    gateway,
    -- The decoded uplink, exactly the shape docs/sensor-telemetry.md documents.
    jsonb_build_object(
      'deviceId', r.dev_eui,
      'containerId', r.oznaka,
      'measuredAt', to_char(r.measured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'receivedAt', to_char((r.measured_at + interval '2 seconds') at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'distanceCm', r.distance_cm,
      'fillPercent', r.fill_percent,
      'temperatureC', r.temp_c,
      'orientation', r.orientation,
      'batteryMv', r.mv,
      'batteryPercent', r.battery_percent,
      'status', jsonb_build_array('ok'),
      'rssi', r.rssi,
      'snr', r.snr,
      'gatewayId', gateway
    )
  from red r
  on conflict (uredjaj_id, measured_at) do nothing;

  -- Emptying detected from tilt: the reset point of every fill curve, and the
  -- confirmation that the planned round was driven.
  insert into app.praznjenje (kontejner_id, detektovano_at, izvor)
  select o.kontejner_id, o.measured_at, 'senzor_tilt'
  from app.ocitavanje o
  join pg_temp.senzori s on s.kontejner_id = o.kontejner_id
  where o.measured_at >= od and o.measured_at <= do_
    and o.orientation = 'emptying'
  on conflict (kontejner_id, detektovano_at) do nothing;

  -- Overflow: the first reliable reading of a collection cycle at 95 % or more.
  -- Closed by the emptying that ends the cycle, so an alarm still open is a
  -- container overflowing right now.
  insert into app.alarm
    (kontejner_id, uredjaj_id, tip, nastao_at, zatvoren_at, prioritet, detalji)
  select
    v.kontejner_id,
    v.uredjaj_id,
    'prelivanje',
    v.nastao_at,
    (select min(p.detektovano_at) from app.praznjenje p
      where p.kontejner_id = v.kontejner_id and p.detektovano_at > v.nastao_at),
    3,
    jsonb_build_object(
      'fill_percent', v.fill_percent,
      'osnov', 'izvedeno iz broja domacinstava, zapremine kontejnera i ucestalosti odvoza')
  from (
    select o.kontejner_id, o.uredjaj_id, o.measured_at as nastao_at,
           o.fill_percent_izracunat as fill_percent,
           row_number() over (partition by o.kontejner_id, c.ciklus order by o.measured_at) as rn
    from app.ocitavanje o
    join pg_temp.senzori s on s.kontejner_id = o.kontejner_id
    cross join lateral (
      select coalesce(max(p.detektovano_at), od) as ciklus
      from app.praznjenje p
      where p.kontejner_id = o.kontejner_id and p.detektovano_at <= o.measured_at
    ) c
    where o.measured_at >= od and o.measured_at <= do_
      and o.pouzdano
      and o.fill_percent_izracunat >= 95
  ) v
  where v.rn = 1;

  -- The cached current state. The map and routing read this; nothing scans
  -- ocitavanje to answer "how full is it right now".
  insert into app.kontejner_stanje
    (kontejner_id, fill_percent, measured_at, trend_pp_po_danu, baterija_percent,
     aktivni_status, tih_od, azurirano_at)
  select
    s.kontejner_id,
    poslednje.fill_percent_izracunat,
    poslednje.measured_at,
    round(s.pp_dnevno, 2),
    poslednje.battery_percent,
    poslednje.status,
    -- Silence is a data gap, never an empty container. Two missed uplinks is the
    -- threshold until the real cadence is decided (docs/sensor-telemetry.md).
    case when poslednje.measured_at < do_ - (2 * korak) then poslednje.measured_at end,
    now()
  from pg_temp.senzori s
  cross join lateral (
    select o.fill_percent_izracunat, o.measured_at, o.battery_percent, o.status
    from app.ocitavanje o
    where o.kontejner_id = s.kontejner_id and o.pouzdano
    order by o.measured_at desc
    limit 1
  ) poslednje
  on conflict (kontejner_id) do update set
    fill_percent     = excluded.fill_percent,
    measured_at      = excluded.measured_at,
    trend_pp_po_danu = excluded.trend_pp_po_danu,
    baterija_percent = excluded.baterija_percent,
    aktivni_status   = excluded.aktivni_status,
    tih_od           = excluded.tih_od,
    azurirano_at     = excluded.azurirano_at;

  return query
    select
      (select count(*) from pg_temp.senzori),
      (select count(*) from app.ocitavanje o
        join pg_temp.senzori s on s.kontejner_id = o.kontejner_id
        where o.measured_at >= od and o.measured_at <= do_),
      (select count(*) from app.praznjenje p
        join pg_temp.senzori s on s.kontejner_id = p.kontejner_id
        where p.detektovano_at >= od and p.detektovano_at <= do_),
      (select count(*) from app.alarm a
        join pg_temp.senzori s on s.kontejner_id = a.kontejner_id
        where a.tip = 'prelivanje' and a.nastao_at >= od and a.nastao_at <= do_);
end;
$$;

comment on function app.generisi_ocitavanja(timestamptz, timestamptz, interval, numeric, smallint) is
  'Computes the reading history every sensored container would have produced, from households served, container volume and collection frequency. Re-runnable: it clears its own window first.';

select * from app.instaliraj_senzore();
select * from app.generisi_ocitavanja();
