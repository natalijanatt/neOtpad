# Fill forecasting

How a container's reading history becomes a curve, an expected overflow time and
a confidence rating. Implemented in `backend/src/forecasting/`; the mathematics
is all in `model/fill-model.ts`, which has no database and no Nest in it.

Read with [`sensor-telemetry.md`](sensor-telemetry.md) — every rule below starts
from what that page says a reading is allowed to mean — and with
[`routing-heuristic.md`](routing-heuristic.md), which is the consumer:
`vreme_kriticnog` is what the `prelivanje` term and the 48-hour must-visit rule
read.

## What the forecast answers

**"When would this container overflow if nobody came."** The curve is
free-running: it never subtracts a scheduled collection, even when
`plan_odvoza` says a truck is due tomorrow.

That is a deliberate split of responsibilities. Routing already has a `rutinski`
term for the schedule, so folding the plan in here would count it twice — and
worse, it would hand routing a `NULL` for every container the routine plan
happens to reach in time, which is exactly the container worth watching when the
plan slips.

**Critical means 95 %**, the same threshold `sensor-telemetry.md` uses for the
`prelivanje` alarm. One number, so a forecast and an alarm never describe
different events.

## The model

Hybrid: what this container has historically done, corrected by what it is doing
right now.

### 1. Cut the history into cycles

Every `praznjenje` is a reset of the curve, so the window is cut there. The
reading that reports the emptying already shows the container empty — the
generator writes `orientation = 'emptying'` on the step following collection — so
a reading at or after an emptying belongs to the **new** cycle. The first cycle
in the window is partial; a partial cycle still has a slope, so it counts.

### 2. A rate per cycle, with Theil–Sen

The median of all pairwise slopes, in percentage points per day. Least squares
over four points lets one odd reading steer the line, and a container produces
odd readings — a bag on the lid, the load settling.

Two exclusions before fitting:

- **Readings at or above 96 % are dropped.** The curve saturates: the sensor
  cannot measure closer than about 2 cm, so a container packed to the lid reads
  98 % and then stays flat for as long as it takes for a truck to arrive. Those
  points are flat by construction, and letting them in flattens the rate of
  precisely the containers that overflow most often. Berilovac is the worked
  example in this dataset.
- A cycle with fewer than 3 usable readings, or spanning less than 12 hours,
  gives no rate at all.

### 3. Blend

```
r_hist = median of the last 6 closed cycles' rates
r_cur  = rate of the open cycle
w      = n_cur / (n_cur + 4)          n_cur = usable readings in the open cycle
r      = w · r_cur + (1 − w) · r_hist
```

The shrinkage constant of 4 is one day of readings at the six-hour cadence. Two
readings after an emptying get a third of the say; a cycle four days in gets
most of it. Missing either side falls back to the other; missing both means
**no forecast is written at all**. That is not an oversight — routing's
`bez_senzora` term is what speaks for such a container, and an invented curve
would outrank it.

A negative blended rate is clamped to zero. Waste does not leave a container by
itself, and a downward curve would forecast an emptying nobody performed.

### 4. Seasonality

Each day of the horizon is multiplied by the product of the
`kalendarski_dogadjaj.ocekivani_faktor` values in force that day for the
container's settlement, its mesna zajednica, or the whole city
(`naselje_id IS NULL AND mesna_zajednica_id IS NULL`). The product is bounded to
`[0.5, 3.0]` so overlapping events cannot run away.

The table is **empty today**, so the factor is 1.0 everywhere. The mechanism is
in place; seeding it with verified holidays, school breaks and fairs — each row
carrying its `izvor` — is a separate job. `ponavljanje` (RRULE) is not expanded
yet, and a half-implemented recurrence would quietly drop the movable feasts it
exists for.

### 5. The curve

Horizon **7 days**, step **6 hours**, 29 points including the starting one.
Seven days because that is the lowest bucket the routing heuristic scores
(`≤ 168 h → 0.2`); six hours because that is the reading cadence.

The curve starts at the **last reading carried forward to now** at the blended
rate — not at the reading itself. Between the last uplink and now the container
kept filling, and for a silent device that is a long way. This is why a forecast
can be materially ahead of `kontejner_stanje.fill_percent`, which is the level as
of the last reading.

`vreme_kriticnog` is the first crossing of 95 %, interpolated inside the
six-hour step rather than snapped to it. If the container is already above 95 %,
the crossing is estimated **backwards** from the last reading: dating it to "now"
would tell routing a container has just become urgent when it has been
overflowing since yesterday. If the rate is zero or the curve does not reach the
threshold inside the horizon, the field is `NULL`.

### 6. The p10/p90 band

The band is the spread the container's own cycles actually showed: the 10th and
90th percentile of the per-cycle rates, each integrated into its own curve. With
fewer than three closed cycles there is no spread to measure, so the band falls
back to ±35 % of the rate and the confidence rating says why. Because the band is
rate-based, it widens with the horizon on its own.

## Confidence (`pouzdanost`)

| Value | When |
|---|---|
| `visoka` | ≥ 3 closed cycles with a rate, ≥ 3 readings in the open cycle, no gap, last reading within one cadence |
| `niska` | no closed cycle at all, **or** a gap, **or** the last reading older than two cadences, **or** the container state carries a fault code or `tih_od` |
| `srednja` | everything else |

This is a label for the dispatcher, not an input to routing. Routing applies its
own reliability rule and zeroes the overflow term on an untrustworthy reading
regardless of what the forecast says about itself.

`ima_rupu` is true when the largest gap between consecutive reliable readings
exceeds two cadences — the same "two missed uplinks" threshold
`sensor-telemetry.md` uses for silence. Gaps are marked, never interpolated
away.

## What is stored

One row per container per run in `prognoza_punjenja`, **appended, never
updated**: comparing yesterday's prediction against today's measurement is the
only honest accuracy metric there is.

`model_verzija` carries the parameters it ran with, e.g.
`hibrid-v1(prag=95,horizont=168h,korak=6h,k=4)`. The table has no column for
them, and a stored forecast that cannot say what it assumed is not reproducible
— the same reason `plan_rute` stores its weights.

`ulazni_podaci_do` is the last reading that fed the forecast. Together with
`izracunata_at` it is how a stale forecast is visible instead of quietly looking
current.

**`trend_pp_po_danu` is deliberately not an input.** It is the per-container
parameter `generisi_ocitavanja()` builds the synthetic curve *with*; a model that
reads it is not forecasting, it is copying the answer key. It is useful only as a
check — see the accuracy note below.

## When it runs

| Trigger | What it does |
|---|---|
| `ForecastRunner`, 02:00 Europe/Belgrade | the whole sensored fleet; disable with `FORECAST_CRON_ENABLED=false` |
| `POST /routes/plan` | refreshes only what is stale, before any scoring |
| `npm run forecast:run` | stale only; `-- --sve` for the whole fleet |

A forecast is stale when any of these holds:

1. there is none,
2. the container was emptied after it was computed — the important one, since
   the curve is then not merely old but describes a container that no longer
   exists,
3. a reading arrived after `ulazni_podaci_do`,
4. it is older than 12 hours.

Reading a forecast through the API never triggers a recomputation.

The nightly run is an in-process timer, so two API instances would both fire it.
One is what is deployed; a second needs an advisory lock, not a second cron.

## API

`GET /containers/{id}/forecast` → the newest stored forecast with its series, or
`prognoza: null` for a container that has none. `404` is reserved for a container
that does not exist — "no forecast" and "no container" are different answers, and
`null` never means "empty container".

`GET /containers?sa_stanjem=true` carries a **summary** of the same forecast on
every container — `vreme_kriticnog`, hours to critical, the expected level in 24
and 48 hours, confidence — and never the curve. The map and the dashboard need
one call for the fleet, and 28 points per container is around 200 KB of series
nobody draws in a list. `kriticno_do` filters that list to the containers a
forecast puts over the threshold before a given instant, which is the "overflows
within 48 h" figure without a second endpoint.

The expected levels are read off the stored curve, interpolated between its
six-hour points and measured from `izracunata_at` — the instant the curve's first
point describes. Measuring them from "now" would move the numbers between two
reads of the same forecast.

## Reading the numbers honestly

Two things have to be said next to any accuracy claim:

- **The history is computed, not measured.** `generisi_ocitavanja()` builds a
  strictly linear curve with no noise, no dropped packets and no device faults.
  A linear model fits it almost perfectly, and that measures the pipeline, not
  the model. The real test arrives with the first installed sensor — or, more
  cheaply, by adding noise and dropouts to the generator.
- **The offset against a naive calculation is the carry-forward, not an error.**
  `(95 − kontejner_stanje.fill_percent) / trend_pp_po_danu` uses the level at the
  last reading; the forecast uses the level *now*. On a dataset whose last
  reading is 15 hours old, every `vreme_kriticnog` lands about 15 hours earlier
  than the naive figure, and it is the naive figure that is wrong.

The second point has a practical consequence for demos: the generated series is
anchored to the moment it was generated, and once it ages past two uplink
intervals every container is correctly rated `niska`. Re-run
`select * from app.generisi_ocitavanja();` before a demo, then the forecast.
