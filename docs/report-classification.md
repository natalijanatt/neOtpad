# Automatic report classification

How an incoming citizen report becomes a proposal about *what the problem is*
and *which service answers it*, and why that proposal never writes itself into
the report.

Read with [`reports-mvp.md`](reports-mvp.md), which owns the triage workflow this
feeds, and [`routing-heuristic.md`](routing-heuristic.md), which consumes the
dispatcher's decision and not this page's proposal.

## The problem

Classification already existed; it was entirely manual, on two separate axes.

| Axis | Column | Who filled it | Values |
|---|---|---|---|
| What the problem is | `prijava.tip` | the citizen, in the web form | `pun_kontejner`, `prelivanje`, `divlja_deponija`, `ostecen_kontejner`, `nedostaje_kontejner`, `drugo` |
| Who goes out | `prijava.tip_obrade` | the dispatcher, at triage | `odvoz`, `ciscenje`, `odrzavanje`, `provera_lokacije` |
| Truck or crew | `prijava.velicina` | either | `mala`, `srednja`, `velika` |

Three gaps followed from that:

1. **SMS and Viber could not enter the queue at all.** `app.dolazna_poruka` holds
   raw inbound text and nothing parsed it, so a channel with no form had no way
   to produce a `tip`. That contradicts the no-smartphone rule in `CLAUDE.md`.
2. **Citizens pick the wrong category.** `pun_kontejner` vs `prelivanje` vs
   `divlja_deponija` around a container is a judgement call, and `velicina` —
   the field that decides truck-or-crew — is almost never set correctly.
3. **Every report waited on a dispatcher** to read the text, open the photo and
   look up which container stands nearby before choosing a response.

## The rule: the classifier proposes, the dispatcher decides

The proposal lives in `app.prijava_klasifikacija`. It never writes to
`app.prijava`.

That is not caution for its own sake. Triage is versioned (`prijava.verzija`),
audited (`prijava_istorija` demands an actor and a reason), and confirmation is
what feeds routing and the risk map. A model's guess written straight into
`tip_obrade` would be on a truck route with nobody in the loop.

This is also what keeps a guess out of the illegal-dump register. A report
confirmed as `divlja_deponija` writes an observation there
([`reports-mvp.md`](reports-mvp.md)), and the trigger is the dispatcher's
confirmation, never this proposal.

The side effect is the measurement: the proposal sits beside the decision the
dispatcher actually saved, and `ishod` records whether the two matched. Nothing
has to be labelled by hand.

**What that number does and does not say.** The triage form is pre-filled from
the proposal, so a dispatcher who accepts the dialog unchanged produces
`prihvacena` by construction. `ishod` therefore measures *how often the proposal
survived review*, not how often a human independently reached the same answer.
It is a useful regression signal — a prompt change that starts producing
`izmenjena` is a prompt change that got worse — and it is not an accuracy figure.
Getting one would mean either dropping the pre-fill or recording that the form
was pre-filled, and neither is in this slice.

| `ishod` | Set when |
|---|---|
| `prihvacena` | confirmed, and both `tip` and `tip_obrade` match the proposal |
| `izmenjena` | confirmed with a different type or response |
| `odbacena` | rejected or marked duplicate — the report was closed, not categorised |

Only `tip` and `tip_obrade` count. They decide which service goes out; size and
priority are refinements a dispatcher adjusts routinely, and treating every tweak
as a disagreement would bury the signal.

## Categories

`tip_prijave` is unchanged. What is new is the grain underneath it:
`app.podkategorija_prijave`, which exists because these problems all land in
`drugo` or `divlja_deponija` today while routing completely differently.

| Sub-category | Covers | Responsible service |
|---|---|---|
| `komunalni_otpad` | ordinary household waste, bagged or loose | per `tip_obrade` |
| `gradjevinski_sut` | rubble, concrete, brick, roof tile, mortar, site soil | crew **with machinery** |
| `kabasti_otpad` | furniture, mattresses, white goods, tyres | crew **with machinery** |
| `opasan_otpad` | asbestos/eternit, batteries, motor oil, paints, medical waste | **licensed hazardous-waste operator** |
| `zeleni_otpad` | branches, leaves, cuttings, orchard and vineyard waste | crew |
| `uginula_zivotinja` | animal carcass or remains | **zoohygiene service** |
| `paljenje_otpada` | waste burning or already alight | **inspection**, fire brigade if needed |
| `van_nadleznosti` | sewage, ragweed, damaged road, street lighting | **another city service** — forwarded, not rejected |
| `nepoznato` | the report does not say what the waste is | `provera_lokacije` |

`van_nadleznosti` is the one that earns its place immediately: today such a
report ends as `odbijena` and the citizen's problem simply disappears.

The sub-category deliberately **only exists on the proposal**. `prijava`'s CHECK
constraints and the API's response rules are load-bearing for the working
triage flow, and this vocabulary has to prove itself before it is promoted onto
the report.

`nadlezna_sluzba` in the API response is **derived** from `tip_obrade` plus the
sub-category (`classification/taxonomy.ts`). It is a label over two stored
columns, so a utility that reorganises its crews renames a string rather than
running a migration.

## Response rules are enforced twice

`reports/response-rules.ts` holds the pairings the dispatcher is bound by, and
both `ReportsService.triage` and the classifier call it. The rules are also
stated in the prompt — stating them is what makes the model propose something
saveable, checking them is what happens when it does not.

A proposal that violates them becomes `provera_lokacije`, which is exactly what
a dispatcher does when they cannot tell either. It is never silently dropped.

## What the model is given

Text alone classifies no better than keywords. The context is the feature:

- the report text, channel, and the type the citizen picked — **a hint, never the
  answer**, since it is the field most often wrong;
- the photographs, at `detail: low`. Usually the deciding evidence: it is what
  separates "the container is full" from "a pile of rubble beside the container"
  from "sheets of asbestos";
- **candidate containers** with distance, reliable fill level and days since last
  emptying. A reading that fails `pouzdanoOcitavanje` is sent as *no data*, never
  as a low percentage ([`sensor-telemetry.md`](sensor-telemetry.md): a missing
  reading is a gap, not a reassuring 0 %);
- the settlement and its `organizovano_prikupljanje`;
- metres to the nearest black spot and to the nearest registry dump. Registry
  rows with `geo_preciznost = 'centroid_naselja'` are excluded — measuring
  distance to a settlement centre would report "40 m from a known dump" for
  anything near the middle of its village
  ([`data-sources.md`](data-sources.md));
- nearby open reports as **duplicate candidates only**.

That context is what lets the same photograph be `prelivanje` beside a serviced
container and `divlja_deponija` far from any container in an uncovered village.

Whatever the classifier returns is then checked: an identifier it did not receive
from us is dropped, a `odvoz` with no container may adopt a **single** candidate
within **30 m** and nothing vaguer, and the response is re-validated. Every
correction caps confidence at **0.5** and is appended to the rationale.

## Two classifiers, one port

`KLASIFIKATOR` (`classification/classifier.port.ts`), same pattern as `STORAGE`
and `ROUTE_OPTIMIZER`.

- **`OpenAiClassifier`** — chat completions with
  `response_format: json_schema, strict: true`, `temperature: 0` so the same
  report does not route to two different crews on two instances. Plain `fetch`:
  one non-streaming endpoint where a hard timeout and a schema-checked response
  are what matter, and `backend/` installs on its own, so a dependency has to
  earn itself.
- **`RuleClassifier`** — Serbian keyword matching over text normalised across
  Cyrillic, Latin-with-diacritics and Latin-without: "прелива се", "preliva še"
  and "preliva se" are one sentence typed by three people.

The rules are not a placeholder. They answer when there is no API key (CI,
contract generation, an offline demo) and after the model exhausts its retries,
because a queue with no proposal leaves the SMS path with no `tip`. Nothing they
produce scores above **0.6**; the model's own range is unconstrained.

## Where it runs

Not inline in `POST /reports`. An anonymous submission must not get slower, or
fail, because an external API is rate-limited or down.

The queue row is written **in the report's own transaction** (an outbox: a report
that is never classified and a classification of a rolled-back report are both
bugs a separate call would allow). `ClassificationRunner` sweeps every 15 s and
claims rows with `for update skip locked`, so a second instance takes different
work rather than duplicating it. The attempt counter is bumped **on claim**, so a
process that dies mid-call still burns a retry and one poisonous report cannot
loop forever at the head of the queue.

`POST /reports/{id}/classify` (dispatcher) reclassifies on demand and is final
on the first attempt: somebody is waiting, so a failed model call falls straight
through to the rules. It claims the row exactly as a sweep would, so the worker
cannot pick up the same row and pay for the same answer twice. `npm run
classify:run` drains the queue from the command line.

**The worker runs only in the API process.** A CLI entry point boots the same
`AppModule`, and a 15-second interval fires inside it the moment that process
lives past its first tick — `import:deponije` would start calling OpenAI because
it happened to run for twenty seconds. `main.ts` is the only caller of
`markServingApi()` (`common/process-role.ts`), and both this runner and
`ForecastRunner` check it. Defaulting to "not the API" is the safe direction:
forgetting to opt in costs a job that does not run, forgetting to opt out costs
work nobody asked for.

### Two drainers, because the timer cannot work on serverless

`ClassificationRunner`'s interval drains the queue on a long-lived server
(`npm run start:dev`, a container). **On Vercel it never runs at all**, and
neither does anything else on a timer: the instance is frozen the moment a
response is flushed, so a timer between requests has no process to fire in. The
production queue therefore sat at `na_cekanju` with `pokusaj = 0` while the same
code drained fine on a laptop — the reports were queued correctly and simply
never read.

`ClassificationDrainInterceptor` is the serverless drainer. It starts once the
submission handler has returned, so the transaction has committed and the queue
row is visible, and hands the work to `waitUntil` from `@vercel/functions` —
the only thing that keeps the function alive past the response. Off Vercel there
is no request context and `waitUntil` is a no-op, leaving an ordinary floating
promise, which is safe in a process that stays up. The citizen's response is
never awaited on it, so the reason the queue exists still holds.

Consequences worth knowing:

- **`markServingApi()` is deliberately not called in `backend/api/index.js`.**
  Letting the interval run on Vercel would be worse than leaving it off: it could
  only ever fire part-way through an unrelated request and be frozen mid-call,
  and because the attempt counter is bumped **on claim**, every frozen sweep
  silently spends one of a report's three retries.
- **`CLASSIFY_DRAIN_BATCH` is 1, not `CLASSIFY_BATCH`.** A submission enqueues
  exactly one row, and background work only has the rest of the function's
  lifetime. For the same reason, keep `CLASSIFY_TIMEOUT_MS` (20 s by default)
  under the deployment's `maxDuration`, or a model call is killed with the
  function and costs an attempt without producing an answer.
- **A backlog drains over the submissions that follow**, one per request. To
  empty it now — after a deploy, or before a demo — use
  `npm run classify:run -- --sve`, which works against whatever `DATABASE_URL`
  points at.
- The interceptor is registered globally by `ClassificationModule` and matches
  the two paths that fill the queue, `POST /reports` and `POST /reports/assisted`.
  It is not a decorator on `ReportsController`, because that would make
  `reports` import this module and the outbox exists so the two never have to
  know about each other. Renaming either route silently stops the drain, which
  is what `classification.drain.spec.ts` guards.

The two writes in `ReportsRepository` — `enqueueClassification` and
`settleClassification` — are the only queries against this table outside the
classification module. They live there because that is where the transaction is.

## Privacy and cost

Report photos live in a public bucket ([`media-storage.md`](media-storage.md)),
and their URLs are sent to OpenAI. The prompt forbids copying faces, plates,
house numbers or names into the rationale, which is staff-only and never part of
the public receipt. No citizen phone number is in the input — it is not part of a
report. `CLASSIFY_USE_PHOTOS=false` turns image sending off entirely.

One call per report version, ~1–2k input tokens plus one low-detail image.
`UNIQUE (prijava_id, prijava_verzija)` means a report is not classified twice for
the same content.

## Configuration

Every variable is in `backend/.env.example`. `OPENAI_API_KEY` is optional; its
absence downgrades the feature rather than stopping the API.
`CLASSIFY_WORKER_ENABLED=false` stops both drainers, the timer and the
post-submission one, so automatic classification is off rather than merely moved.

"Absent" includes `OPENAI_API_KEY=` with nothing after it, which is what a copy
of `.env.example` contains. A `.env` file cannot express `undefined`, and
`@IsOptional` skips only `undefined` and `null` — so the empty string is mapped
to absent before validation, or copying the documented example would stop the
API from booting.

## Known limits

- **The model states things the context does not support.** Observed on real
  reports: it read a neighbouring report's description as evidence about this
  one, asserted a fill level nobody measured, and once wrote "no containers
  nearby" for a report with two candidates at 0 m. The first two are addressed
  in the prompt; all of them are why nothing here writes to `prijava`, and why
  the rationale is advisory text rather than a stored fact.
- **No accuracy figure yet, and `ishod` is not one.** See the pre-fill caveat
  above: it counts proposals that survived review. The threshold for
  auto-confirming anything is a decision to make against data that does not
  exist yet. Until then every proposal is advisory.
- **The black-spot signal has no data behind it.** `crna_tacka` has no rows in
  any environment yet, so in practice that distance is always null. The query
  itself is verified — against a temporary row it returns 49 m for a point 50 m
  away — and the identically shaped registry-dump query is verified against the
  real 52 imported dumps.
- **SMS intake is not built.** The classifier is the piece that makes it
  possible — `app.dolazna_poruka` → extracted `{tip, naselje, opis_lokacije,
  velicina}` → a `prijava` with `kanal: sms` — but the gateway and the parser
  are not in this slice.
- **Duplicate suggestions are advisory only.** `predlozeni_duplikat_od` is never
  acted on; the duplicate decision stays with staff and its own cycle checks.
