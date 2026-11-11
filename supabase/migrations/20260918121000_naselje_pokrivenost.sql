-- Organised collection per settlement: what it is, and where that answer came from.
--
-- `organizovano_prikupljanje` was a boolean because the plan was to import the
-- covered settlements from the LPUO. The LPUO turned out to give only the total
-- ("3.688 households in 31 settlements") and never names them; the list exists in
-- JP Komunalac's 2018 business programme, which is eight years old. So the column
-- has to be able to say "nobody has established this yet" — a settlement added
-- from a source that does not discuss collection must not silently arrive as
-- false, which reads downstream as the strongest possible reason to expect an
-- illegal dump.
--
-- app.trojstvo is the same three-state the schema already uses for
-- `ponovo_se_stvara`, where a blank in the source is not a "no".

alter table app.naselje
  alter column organizovano_prikupljanje drop not null;

alter table app.naselje
  alter column organizovano_prikupljanje type app.trojstvo
    using case organizovano_prikupljanje
            when true  then 'da'::app.trojstvo
            when false then 'ne'::app.trojstvo
            else 'nepoznato'::app.trojstvo
          end;

alter table app.naselje
  alter column organizovano_prikupljanje set default 'nepoznato',
  alter column organizovano_prikupljanje set not null;

comment on column app.naselje.organizovano_prikupljanje is
  'Does the utility collect here. Evidence and its date live in app.pokrivenost_naselja; this column is the current best answer.';

-- The LPUO sorts every settlement into four classes by the 2011 census. For the
-- 49 settlements no collection document mentions, this is the only size signal
-- there is, and size decides how many households one container serves.
alter table app.naselje
  add column kategorija_naselja text;

comment on column app.naselje.kategorija_naselja is
  'LPUO 2021-2031 size class: I (>1000 stanovnika), II (100-1000), III (<100), IV (<10), grad.';

-- The settlement list is imported from documents and re-imported when a document
-- is corrected, so it needs a key. `sifra_mesta` would be the right one, but the
-- registry publishes a code for only five of the 72 settlements; the name within
-- a municipality is the only identifier every source carries.
alter table app.naselje
  add constraint naselje_naziv_u_opstini unique (naziv, opstina);

-- Coverage as a dated observation rather than a standing fact.
--
-- The one document that lists the served settlements is from 2018 and the
-- containers it counts were placed in 2013. A 2026 answer from the utility must
-- be able to land next to it without overwriting it, because the difference
-- between the two is itself the thing worth seeing.
create table app.pokrivenost_naselja (
  id                     uuid primary key default gen_random_uuid(),
  naselje_id             uuid not null references app.naselje(id) on delete cascade,
  izvor                  text not null,
  izvor_url              text,
  godina                 integer not null,
  organizovano           app.trojstvo not null,
  -- Collections per week as the utility plans them: 1, 2 or 3 in the 2018 plan.
  odvoz_nedeljno         smallint check (odvoz_nedeljno between 1 and 14),
  broj_domacinstava      integer,
  broj_stanovnika        integer,
  broj_kontejnera_1100l  integer,
  napomena               text,
  unique (naselje_id, izvor, godina)
);

create index pokrivenost_naselja_idx on app.pokrivenost_naselja (naselje_id, godina desc);

-- The lockdown migration turned RLS on for the tables that existed then; a table
-- added later has to do it itself or it is the one row-level exception.
alter table app.pokrivenost_naselja enable row level security;
