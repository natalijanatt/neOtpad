-- Collection points and 1100 L containers for the places the sources document as
-- having them.
--
-- Nothing here is invented arithmetic. The container counts are JP Komunalac's
-- own 2018 rural collection plan, already imported into
-- `app.pokrivenost_naselja.broj_kontejnera_1100l`; the city's points are named
-- after the streets the published 2026 schedule lists, already imported into
-- `app.plan_odvoza.zona`. Only `komunalni`: the blue bin has a published schedule
-- but no published count, and a container nobody counted is not a container this
-- system may claim exists.
--
-- Why a function rather than a plain INSERT. This migration runs against an empty
-- database on `npm run db:reset` (migrations first, `seed.sql` after) and against
-- the cloud project where `npm run import:naselja` has already run. The same code
-- has to produce nothing in the first case, the full set in the second, and the
-- new rows in a third — after a later import adds settlements or streets. So the
-- logic is installed as a function, called once here, called again from
-- `seed.sql`, and callable by hand afterwards:
--
--   select * from app.izgradi_sabirna_mesta();

-- The one thing about these rows a map must not get wrong.
--
-- No source gives a container's coordinates. What exists is the settlement
-- centroid, so every position below is derived from it. `app.geo_preciznost`
-- already draws exactly this distinction for dump sites, and a collection point
-- needs it for the same reason: a derived position rendered like a surveyed one
-- invents a location. A survey later sets 'registarska_tacka' per row and the map
-- changes on its own.
alter table app.sabirno_mesto
  add column geo_preciznost app.geo_preciznost not null default 'centroid_naselja';

comment on column app.sabirno_mesto.geo_preciznost is
  'How the position was arrived at. ''centroid_naselja'' = derived from the settlement centroid, not surveyed; do not render it like a measured point.';

-- So the builder can be re-run without duplicating points. A collection point is
-- identified by its name within its settlement — for the city that name is the
-- street, which is how the utility refers to them itself.
alter table app.sabirno_mesto
  add constraint sabirno_mesto_naziv_u_naselju unique (naselje_id, naziv);

-- The settlement part of a container label: PI-KRU-004 is Krupac's fourth.
--
-- Diacritics are translated rather than stripped, because `oznaka` is ASCII by the
-- rule in docs/domain-glossary.md and the label is painted on a physical unit.
-- Two-word names take one letter from the first word and two from the second, so
-- Veliki Jovanovac (VJO) and Veliko Selo (VSE) stay apart — a plain three-letter
-- prefix would collide.
create or replace function app.kod_naselja(naziv text)
returns text
language sql
immutable
set search_path = ''
as $$
  with reci as (
    select array_remove(
             regexp_split_to_array(
               upper(translate(naziv, 'ŽžĆćČčŠšĐđ', 'ZzCcCcSsDd')),
               '[^A-Z0-9]+'),
             '') as w
  )
  select case
           when w is null or array_length(w, 1) is null then 'XXX'
           when array_length(w, 1) = 1 then rpad(substr(w[1], 1, 3), 3, 'X')
           else substr(w[1], 1, 1) || rpad(substr(w[2], 1, 2), 2, 'X')
         end
  from reci;
$$;

comment on function app.kod_naselja(text) is
  'ASCII settlement code used in kontejner.oznaka (Krupac -> KRU, Veliki Jovanovac -> VJO).';

-- ---------------------------------------------------------------------------
-- The builder
-- ---------------------------------------------------------------------------
create or replace function app.izgradi_sabirna_mesta()
returns table (naselje text, sabirnih_mesta bigint, kontejnera bigint)
language plpgsql
set search_path = ''
as $$
declare
  -- The 2018 plan counts containers placed in 2013, and that is the only
  -- placement date any source states.
  postavljeno constant date := date '2013-01-01';
  -- Households one 1100 L container serves in the plan itself: 3.688 households
  -- against 260 containers. Used only to split a household count across a
  -- settlement's points — never to conjure a container.
  po_kontejneru constant numeric := 14;
begin
  -- 1. Village collection points.
  --
  -- About three containers to a point, which is the plan's own stop-to-container
  -- ratio (31 stops, 260 containers). Positions sit on concentric rings around
  -- the centroid: eight to a ring, 350 m apart. A ring rather than a scatter
  -- because it needs no random term — the angle is the point's index — and a
  -- village with a single point lands exactly on its documented centroid.
  insert into app.sabirno_mesto
    (naselje_id, naziv, lokacija, broj_domacinstava, aktivno_od, geo_preciznost)
  select
    p.naselje_id,
    format('%s - sabirno mesto %s', p.naziv, p.i),
    extensions.st_point(
      extensions.st_x(p.centroid::extensions.geometry)
        + (p.r * sin(p.ugao))
          / (111320.0 * cos(radians(extensions.st_y(p.centroid::extensions.geometry)))),
      extensions.st_y(p.centroid::extensions.geometry) + (p.r * cos(p.ugao)) / 111320.0
    )::extensions.geography,
    case when p.domacinstava is null then null
         else greatest(1, round(p.domacinstava::numeric / p.mesta)::int) end,
    postavljeno,
    'centroid_naselja'
  from (
    select
      c.naselje_id, c.naziv, c.centroid, c.domacinstava, c.mesta, g.i,
      2 * pi() * ((g.i - 1) % 8) / 8.0 as ugao,
      case when c.mesta = 1 then 0 else 350.0 * ceil(g.i / 8.0) end as r
    from (
      -- The latest year wins: a 2026 answer from the utility supersedes the 2018
      -- programme rather than being averaged with it.
      select distinct on (pk.naselje_id)
             pk.naselje_id,
             n.naziv,
             n.centroid,
             coalesce(n.broj_domacinstava, pk.broj_domacinstava) as domacinstava,
             greatest(1, round(pk.broj_kontejnera_1100l / 3.0)::int) as mesta
      from app.pokrivenost_naselja pk
      join app.naselje n on n.id = pk.naselje_id
      where pk.broj_kontejnera_1100l > 0
      order by pk.naselje_id, pk.godina desc
    ) c
    cross join generate_series(1, c.mesta) as g(i)
  ) p
  on conflict (naselje_id, naziv) do nothing;

  -- 2. City collection points, one per street.
  --
  -- The street list is real: it is the gazetteer the published schedule is written
  -- against. The positions are not — the city has one centroid — so the points go
  -- on rings of 24, 220 m apart, which fills the ~2 km the built-up area covers.
  -- Streets are ordered by name so the layout is reproducible.
  insert into app.sabirno_mesto
    (naselje_id, naziv, lokacija, broj_domacinstava, aktivno_od, geo_preciznost)
  select
    u.naselje_id,
    format('%s - %s', u.naziv, u.zona),
    extensions.st_point(
      extensions.st_x(u.centroid::extensions.geometry)
        + (u.r * sin(u.ugao))
          / (111320.0 * cos(radians(extensions.st_y(u.centroid::extensions.geometry)))),
      extensions.st_y(u.centroid::extensions.geometry) + (u.r * cos(u.ugao)) / 111320.0
    )::extensions.geography,
    -- Two containers to a street point, so the household share is twice the
    -- households-per-container figure the rural plan implies.
    greatest(1, round(2 * po_kontejneru)::int),
    postavljeno,
    'centroid_naselja'
  from (
    select
      z.naselje_id, z.naziv, z.centroid, z.zona,
      2 * pi() * ((z.i - 1) % 24) / 24.0 as ugao,
      220.0 * ceil(z.i / 24.0) as r
    from (
      select distinct po.naselje_id, n.naziv, n.centroid, po.zona,
             row_number() over (partition by po.naselje_id order by po.zona) as i
      from app.plan_odvoza po
      join app.naselje n on n.id = po.naselje_id
      where po.zona is not null
        and n.kategorija_naselja = 'grad'
    ) z
  ) u
  on conflict (naselje_id, naziv) do nothing;

  -- 3. Containers on those points.
  --
  -- A settlement's documented total spread over its points, remainder to the
  -- earliest points, labelled in one sequence per settlement so PI-KRU-001..028
  -- reads as one village's fleet. `on conflict (oznaka) do nothing` is what makes
  -- a re-run a no-op, and is also how the hand-seeded PI-KRU-004 keeps its own
  -- collection point instead of being moved under a generated one.
  insert into app.kontejner
    (oznaka, sabirno_mesto_id, tip_otpada, zapremina_l, postavljen_datum)
  select
    format('PI-%s-%s', app.kod_naselja(z.naselje), lpad(z.rn::text, 3, '0')),
    z.sabirno_mesto_id,
    'komunalni',
    1100,
    postavljeno
  from (
    select r.*, row_number() over (partition by r.naselje_id order by r.idx, r.j) as rn
    from (
      select m.sabirno_mesto_id, m.naselje_id, m.naselje, m.idx,
             generate_series(1, m.kom::int) as j
      from (
        select sm.id as sabirno_mesto_id,
               sm.naselje_id,
               n.naziv as naselje,
               row_number() over (partition by sm.naselje_id order by sm.naziv) as idx,
               (c.ukupno / count(*) over (partition by sm.naselje_id))
                 + case when row_number() over (partition by sm.naselje_id order by sm.naziv)
                             <= c.ukupno % count(*) over (partition by sm.naselje_id)
                        then 1 else 0 end as kom
        from app.sabirno_mesto sm
        join app.naselje n on n.id = sm.naselje_id
        join (
          -- Villages: the documented count. Parenthesised because its ORDER BY
          -- belongs to the branch, not to the union.
          (select distinct on (pk.naselje_id)
                  pk.naselje_id, pk.broj_kontejnera_1100l::bigint as ukupno
           from app.pokrivenost_naselja pk
           where pk.broj_kontejnera_1100l > 0
           order by pk.naselje_id, pk.godina desc)
          union all
          -- The city: no source counts its containers, and the mixed-waste
          -- schedule is not published either (waste-scraper/IZVORI.md). Two per
          -- street point is a derivation from the ratio the rural plan does
          -- document, and it is the number in this migration most in need of
          -- being replaced by a real figure from the utility.
          (select sm2.naselje_id, 2 * count(*)
           from app.sabirno_mesto sm2
           join app.naselje n2 on n2.id = sm2.naselje_id
           where n2.kategorija_naselja = 'grad'
             and sm2.aktivno_do is null
             and not exists (
               select 1 from app.pokrivenost_naselja pk2
               where pk2.naselje_id = sm2.naselje_id
                 and pk2.broj_kontejnera_1100l > 0
             )
           group by sm2.naselje_id)
        ) c on c.naselje_id = sm.naselje_id
        where sm.aktivno_do is null
      ) m
      where m.kom > 0
    ) r
  ) z
  on conflict (oznaka) do nothing;

  return query
    select n.naziv, count(distinct sm.id), count(k.id)
    from app.naselje n
    join app.sabirno_mesto sm on sm.naselje_id = n.id and sm.aktivno_do is null
    left join app.kontejner k on k.sabirno_mesto_id = sm.id and k.uklonjen_datum is null
    group by n.naziv
    order by n.naziv;
end;
$$;

comment on function app.izgradi_sabirna_mesta() is
  'Builds collection points and containers from the documented container counts (pokrivenost_naselja) and the city street list (plan_odvoza.zona). Idempotent; re-run after an import adds settlements or streets.';

select * from app.izgradi_sabirna_mesta();
