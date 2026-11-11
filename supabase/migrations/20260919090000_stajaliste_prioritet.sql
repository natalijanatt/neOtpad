-- A stop's priority and the terms that produced it.
--
-- `razlog` names the single strongest reason; that is enough for a driver but
-- not for a dispatcher deciding whether to approve the plan, or for a village
-- asking why it was skipped. The same rule as `rizik.komponente`: an objective
-- is only defensible if every term that went into it is kept next to the
-- result, so nothing has to be recomputed with weights that may since have
-- changed.
alter table app.stajaliste_rute
  add column prioritet  numeric(6,3),
  add column komponente jsonb;
