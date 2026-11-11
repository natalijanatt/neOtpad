# Routing heuristic

How a day's routes are chosen and ordered. This is the phase-1 optimiser
(`GreedyRiskAwarePlanner`, `backend/src/routing/optimizer/`); phase 3 replaces
the algorithm behind the `ROUTE_OPTIMIZER` port, not the facts on this page.

Read with [`sensor-telemetry.md`](sensor-telemetry.md): the first rule below is
that page's "a diagnostic code outranks the measurement", applied to routing.

## What "fastest route" means here

Two questions, answered in this order:

1. **Which collection points are served today?** Decided by a priority score
   built from overflow forecast, illegal-dump risk, confirmed citizen reports and
   coverage. Distance plays no part in this step for the stops that matter.
2. **In what order, by which truck?** Decided by driving time alone, for the
   stops step 1 chose.

That split is the product claim from `CLAUDE.md`: a remote village is never
dropped *because* it is far. It can only be left out when a truck physically
cannot reach it within the shift or its body is full — and then the plan says so
(`nepokriveno`), it does not silently omit it.

## Step 1 — priority per container, worst container per stop

The sensor is mounted on the container, not the collection point, so the score
is computed **per container** (`optimizer/priority.ts`). A stop is still one
physical visit — a truck does not drive to the same coordinates twice because
two bins sit there — but *why* it visits is a property of one bin, not an
average of everything nearby. Each term is 0..1, multiplied by a weight and
summed; every container's own terms are stored (`stajaliste_rute.komponente.kontejneri`,
one entry per container) so the dispatcher can see which bin actually triggered
the stop, not just that the point scored high.

| Term | Source | Value | Scope |
|---|---|---|---|
| `prelivanje` | latest `prognoza_punjenja.vreme_kriticnog`; fallback `kontejner_stanje.fill_percent` | hours to critical ≤ 24 → 1.0, ≤ 48 → 0.8, ≤ 72 → 0.5, ≤ 168 → 0.2. No forecast: fill ≥ 90 → 1.0, ≥ 80 → 0.7, ≥ 60 → 0.3. **0 when the state is unreliable** (`aktivni_status` other than `ok`, or `tih_od` set). | per container |
| `rizik` | latest `rizik` for the `sabirno_mesto`, else for its `naselje` | `skor / 100`, clamped; `klasifikacija = 'crna_tacka'` → 1.0 | shared by every container at the point — risk is scored against the location, not a bin |
| `prijava` | open `prijava` with `potvrdjena_at` set and `resena_at` null, container-shaped types only | `pun_kontejner` / `prelivanje` → 1.0, `ostecen_kontejner` → 0.5, other → 0.3 | the container the report names; a location-only report (no container) applies to every container at the matched point |
| `pokrivenost` | `naselje.organizovano_prikupljanje` | `ne` → 1.0, `nepoznato` → 0.5, `da` → 0 | shared — a property of the settlement |
| `domacinstva` | `sabirno_mesto.broj_domacinstava` | `log10(1 + n) / 3`, clamped | shared — a property of the point |
| `rutinski` | a `plan_odvoza` row for **this container's own `tip_otpada`** lands on the day | 1 or 0 | per container — a `suvi_reciklabilni` bin's schedule is never read off the `komunalni` bin beside it |
| `bez_senzora` | no active `uredjaj_montaza` on this container; days since its last `praznjenje` | `min(days / ciklus_dana, 1)`; never emptied → 1. `ciklus_dana` from this container's own stream in `plan_odvoza`, default 14. | per container |

**Where the forecast comes from.** `prognoza_punjenja.vreme_kriticnog` is
written by the forecasting module ([`fill-forecasting.md`](fill-forecasting.md)),
and `POST /routes/plan` refreshes every stale forecast before it scores
anything — an emptying invalidates the curve, so planning on a forecast computed
before the last collection would rank a container that has just been emptied.
The curve is free-running: it assumes nobody collects, which is why the schedule
enters the score only through `rutinski` and never twice.

**Minimum fill floor.** A container with a *reliable* reading below **20 %**
cannot be a candidate at all — every term is forced to 0, not only
`prelivanje`. A confirmed report, a black-spot risk score, an uncovered
settlement, today's schedule: none of them puts a demonstrably near-empty
container on the route. The floor reads the current measurement, not the
forecast, so a container ETA-critical in a few hours but reading 10 % right
now is still excluded — that is tomorrow's problem, not today's detour.
Doesn't apply when the reading is unreliable (nothing to compare against 20 %
with any confidence) or absent (`bez_senzora` already covers that container).

Default weights: `prelivanje 0.35, rizik 0.20, prijava 0.20, pokrivenost 0.10,
domacinstva 0.05, rutinski 0.05, bez_senzora 0.05`. They have no defensible
values yet (`backend-architecture.md`, open questions); every plan stores the
weights it was built with in `plan_rute.cilj_funkcija`, and a request may
override any of them.

**Must-visit** (`obavezno`), served regardless of distance — true for a stop
when **any** of its containers meets one of these:

- forecast reaches critical within **48 h**, or
- no forecast and a *reliable* reading at **≥ 80 %**, or
- an open confirmed report, or
- that container's own priority ≥ `prag_obaveznog` (default **0.6**).

Everything else is optional and competes in step 2.

**`ocekivanoPunjenje` is not the same as "0 % full."** It is only meaningful
when `imaOcitavanje` is true — a container with no sensor mounted, or whose
last reading carried a diagnostic fault, has no trustworthy number at all
(`sensor-telemetry.md`: a missing reading is a gap, never a reassuring 0 %).
The API returns `0` as a placeholder in that case; the UI must check
`imaOcitavanje` and show "no data", not a fill bar. This is the exact
container the "bez_senzora" term exists for — it can end up on the route
(cycle overdue, still serving households) while genuinely having nothing to
report about its fill level.

**The stop's `prioritet`/`razlog`/`komponente`/`ocekivanoPunjenje`** are its
**worst container's** — visiting is driven by whichever bin needs it most, and
every other bin there rides along for free since the truck is already
stopping. `razlog` is the term with the largest weighted contribution on that
container: `prelivanje` → `prelivanje_rizik`; `rizik`, `pokrivenost` →
`rizik_divlje_deponije`; `prijava` → `prijava`; `rutinski` → `rutinski`;
`bez_senzora` → `bez_senzora`; `domacinstva` → `domacinstva`; nothing at all →
`usput`. Each term keeps its own `razlog` rather than collapsing into
`rutinski` — a stop scored entirely by `bez_senzora` is optional (its
priority is low, and it competes on `min_odnos` like anything else), and
labelling it "regular schedule" would claim a fixed pickup day that was never
checked. The API exposes every container's own score too
(`RouteStopDto.kontejneri`), not just the winner.

### Attaching a report to a container

A report names a container when the citizen could — the fault and the sensor
are both on one bin, and the score reflects only that bin. An SMS gives at best
a location, so a report with GPS and no container attaches to every container
at the nearest active point within **300 m**, since the citizen never said
which one; one with neither stays out of routing until triage places it.
Reports of type `divlja_deponija` never enter the truck plan — a dump needs a
crew and machinery (`CLAUDE.md`, citizen reports).

## Step 2 — routes

Cost model (`RoutingParameters`, also stored in `cilj_funkcija`):

| Parameter | Default | Meaning |
|---|---|---|
| `faktor_puta` | 1.35 | road distance ≈ straight line × this (rural roads; same factor the frontend mock used) |
| `brzina_kmh` | 32 | average speed including village streets |
| `trajanje_stajanja_min` | 5 | per stop |
| `trajanje_po_kontejneru_min` | 2 | per container beyond the first at the stop |
| `koeficijent_sabijanja` | 3 | compactor ratio; load = Σ `zapremina_l` × fill ÷ 1000 ÷ this, fill = reading or 0.8 when unknown |
| `radno_vreme_min` | 480 | shift, return to depot included |
| `pocetak_smene` | 06:00 | local time; ETAs count from here |

Distances come from the `DISTANCE_PROVIDER` port. Phase 1 is haversine × factor;
OSRM is a phase-3 swap that ignores the factor.

Algorithm — parallel cheapest insertion, then local search:

1. Every active `vozilo` starts as depot → depot.
2. Must-visit stops, by descending priority: insert at the cheapest feasible
   position over all trucks (capacity and shift respected). None feasible →
   `nepokriveno` with `kapacitet` or `radno_vreme`; no active truck at all →
   `nema_vozila`.
3. Optional stops: repeatedly take the one with the highest
   `prioritet / marginal minutes` (marginal minutes include the stop itself)
   while that ratio ≥ `min_odnos` (default **0.01**: a priority of 0.2 buys a
   20-minute detour). What is left is `preskoceno` — not an error.
4. Each route is improved with 2-opt and Or-opt (segments of 1–3 stops), depot
   fixed at both ends. Service time is order-independent, so shorter distance is
   the shorter day.
5. `doprinos_ceni` on a stop is the marginal minutes at insertion time;
   `planirani_dolazak` is computed after improvement from `pocetak_smene`.

Trucks sharing a depot fill in a fixed order (ties go to the earlier vehicle),
so with few stops one truck does the round and the other stays in. A truck with
no stops produces no `plan_rute` row.

## Not yet decided

- **Mid-route unloading.** Capacity is a hard cap per route; a truck does not
  drive to the landfill and continue. Fine at 16 m³ bodies and a 3:1 ratio for
  today's container count, wrong once every village has a sensored point.
- **Weights and `min_odnos`.** Hand-seeded. Tuning is a phase-2 task against the
  historical observations.
- **Priority when the forecast disagrees with the reading.** The forecast wins
  today (a full container with a far-off ETA scores 0 on `prelivanje`); whether a
  reliable reading should cap that is open.
- **The minimum fill floor also silences non-fullness reports.** A confirmed
  `ostecen_kontejner` (damaged container) report is about the physical unit, not
  its fill level, but a reading below 20 % currently zeroes it out the same as
  any other term. Decided as-is for now; revisit if damage reports need a path
  that survives the floor.
