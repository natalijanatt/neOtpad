# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What we are building

A smart waste-management system for the city of Pirot and its surrounding rural
settlements. The municipal utility has a fixed fleet (~8 collection trucks) that
today drives a **fixed schedule**: every settlement is visited at the same
interval regardless of how full its containers actually are. The result is trucks
driving to near-empty villages while other locations overflow and turn into
illegal dumps (`divlje deponije`).

The system replaces that with **predictive, risk-weighted collection**:

1. **IoT sensing** — ultrasonic fill-level sensors on shared containers and
   collection points (not individual bins), prioritising containers that serve
   many households and locations with a history of overflow or illegal dumping.
   Transport is LoRaWAN: long range, low power, multi-year battery life, gateway
   placement chosen so one gateway covers as many villages as possible.
2. **Forecasting** — a model predicts fill level over the coming days and
   estimates when a container reaches a critical level. Local seasonality matters
   and must be modelled explicitly: weekends, public holidays, village
   patron-saint days (`slave`), fairs (`vašari`), harvest and other agricultural
   periods, and temporary population spikes (seasonal workers, returnees).
3. **Route optimisation** — daily routes for the available trucks. The objective
   is **not** only distance, fuel or driving time. Overflow risk and illegal-dump
   risk enter the cost function, so a remote village is not silently dropped
   because it is expensive to reach: if the data says the container will
   overflow, or that overflow at that spot historically produces an illegal dump,
   its priority goes up. Cost optimisation and the ecological goal are the same
   objective.
4. **Risk map / black spots** — historical illegal-dump records combined with
   container-overflow history, sensor data and citizen reports produce a risk
   map. Recurring locations ("black spots") trigger recommendations: collect more
   often, add a container, move a container, or schedule a clean-up action.
5. **Citizen reports** — a report (photo + location) of a full container or an
   illegal dump is another prioritisation signal, especially where no sensor
   exists yet. Different problems route differently: a full container joins the
   next truck route; a large illegal dump needs a dedicated crew, machinery or an
   organised clean-up.
6. **Incentives** — points for confirmed reports, participation in clean-up
   actions and correct recycling and sorting; plus a competition between villages
   and local communities ("cleanest village of the month") scored on measurable
   indicators (new dumps, recurrence at cleaned sites). Rewards are
   community-level: local infrastructure, equipment, public recognition.
7. **Information & education** — when the truck arrives in a given settlement,
   where each waste type goes, how to handle waste that does not belong in a
   standard municipal container.

### Non-negotiable product constraints

- **Do not assume a smartphone.** "When does the truck come" and basic problem
  reporting must also work over SMS/Viber, and via intermediaries (local
  community presidents, schools). A feature designed app-only is incomplete.
- **Prevention over reaction.** The point is to act *before* the overflow or the
  new dump, and to feed collected data back into decisions about container
  placement, collection frequency and utility priorities.
- **Rural first.** Coverage gaps are the root cause: settlements outside the
  organised collection system are where dumps appear. Nothing should be designed
  so that it only works for the dense urban core.

## Domain reference lives in `docs/`

This file is working instructions. The facts the code has to agree with are in
[`docs/`](docs/README.md), one topic per file — read the relevant page before
designing against it, and put new domain facts there rather than here:

- [`docs/sensor-telemetry.md`](docs/sensor-telemetry.md) — what a container
  sensor sends and what may be concluded from each field. **Read before touching
  ingest, fill forecasting or routing priority.**
- [`docs/domain-glossary.md`](docs/domain-glossary.md) — Serbian domain terms and
  the naming rule for fields.
- [`docs/data-sources.md`](docs/data-sources.md) — the Pirot illegal-dump
  datasets and the traps in them.
- [`docs/backend-architecture.md`](docs/backend-architecture.md) — NestJS module
  layout and the database schema. **Read before adding a feature module, a
  table or a migration.**
- [`docs/fill-forecasting.md`](docs/fill-forecasting.md) — how a container's
  reading history becomes a fill curve and an expected overflow time, and what
  `pouzdanost` means. **Read before touching `backend/src/forecasting/` or
  anything that consumes `vreme_kriticnog`.**
- [`docs/routing-heuristic.md`](docs/routing-heuristic.md) — how the daily plan
  chooses and orders its stops: priority terms, must-visit thresholds, cost
  model. **Read before changing anything in `backend/src/routing/`.**
- [`docs/report-classification.md`](docs/report-classification.md) — automatic
  triage of an incoming report: the category vocabulary, which service each
  answer routes to, and the rule that the classifier only proposes. **Read
  before touching `backend/src/classification/` or anything that reads
  `prijava_klasifikacija`.**
- [`docs/media-storage.md`](docs/media-storage.md) — where report photos live,
  what content is accepted and why the bucket being public matters. **Read
  before touching photo upload or anything that renders `javni_url`.**
- [`docs/news-feed.md`](docs/news-feed.md) — utility news for citizens: feed
  order, the settlement filter and why an SMS may be 70 characters, not 160.
- [`docs/disposal-search.md`](docs/disposal-search.md) — the "gde da odložim"
  search: real drop-off sites, waste collectors, the OpenAI classifier and its
  free fallback. **Read before touching `backend/src/disposal/` or the model.**

## Repository layout

```
backend/         NestJS 11 API. Source of truth for the HTTP contract.
frontend/        React 19 + Vite 6 SPA. Talks to the API only via the generated client.
contracts/       openapi.json — generated from backend, consumed by frontend. Never hand-edited.
supabase/        Database only: SQL migrations, seed, local-stack config. Owns the schema.
docs/            Domain reference: sensor telemetry, glossary, data sources, backend architecture.
waste-scraper/   Collected Pirot illegal-dump datasets (CSV) + provenance notes. Data, not app code.
.github/         CI: contract generation, lint, breaking-change detection.
lefthook.yml     Git-level pre-commit enforcement of the same checks.
```

This is deliberately **not** an npm workspace. `backend/` and `frontend/` install
and run independently; the root package installs only lefthook and the Supabase
CLI, both of which are repository-level tools rather than anyone's dependency.

## The one rule: the contract is generated

`contracts/openapi.json` is produced from the NestJS controllers and DTOs and is
the only thing the frontend sees. It is never written by hand — a manual edit is
erased by the next generation run, and the pre-commit guard rejects the commit
before that happens.

- Adding or changing an endpoint → follow `backend/.claude/skills/add-endpoint`.
  Regenerate and stage `contracts/openapi.json` **in the same commit** as the
  code that changed it.
- Calling an endpoint from the UI → follow
  `frontend/.claude/skills/consume-endpoint`. Never hand-write a response type;
  derive it from `src/api/generated/schema.ts`.
- `frontend/src/api/generated/` is generated output; a hook blocks edits to it.
- The contract version lives in `backend/src/openapi.config.ts` (`API_VERSION`)
  and the generator propagates it to `contracts/package.json`. CI runs
  `oasdiff breaking` against `main`: additive changes pass, removals, type
  changes and newly-required fields fail.

Two more skills carry the house style and are worth consulting before writing
code: `backend/.claude/skills/nestjs-best-practices` and
`frontend/.claude/skills/react-best-practices`.

## Commands

Node 22 (matches CI). Docker is needed for the local database.

```bash
# repository root/
npm run db:start           # local Postgres 17 + PostGIS, migrations and seed applied
npm run db:reset           # rebuild from migrations + seed.sql, from nothing
npm run db:status          # connection details; Studio on :54323
npm run db:new <name>      # new empty migration in supabase/migrations/

# backend/
npm run start:dev          # watch mode on :3000, Swagger UI at /docs
npm test                   # jest
npm run typecheck
npm run db:types           # regenerate src/database/generated/schema.ts from the live DB
npm run openapi:generate   # regenerate contracts/openapi.json
npm run import:naselja     # load the 72 settlements, aliases, coverage and schedule
npm run import:deponije    # load waste-scraper/data/ into app.deponija_* (run after naselja)
npm run forecast:run       # recompute stale fill forecasts (-- --sve for the whole fleet)
npm run classify:run       # classify queued citizen reports (-- --sve to drain the queue)
npm run cleanup:photos     # delete unclaimed report photos past their staging deadline
npm run contract:check     # generate + spectral lint + fail if the committed contract is stale

# frontend/
npm run dev                # vite
npm run mock               # Prism mock of the contract on :4010 — the client's default base URL
npm run api:generate       # regenerate src/api/generated/schema.ts from the contract
npm run typecheck
```

The frontend runs with **no backend on the machine**: `VITE_API_BASE_URL`
defaults to the Prism mock on `:4010`. Point it at a real server to switch.

The backend needs `backend/.env` (copy `backend/.env.example`). Contract
generation deliberately does not: it runs with no database, because CI has none.

Supabase is used as a **database only** — no Auth, Realtime or PostgREST, all
switched off in `supabase/config.toml` — with one exception: report photos go to
a Supabase **Storage** bucket, written by the API with server-side credentials
([`docs/media-storage.md`](docs/media-storage.md)). The frontend never talks to
Supabase for either; the generated contract stays the only thing it sees. The schema is owned
by SQL migrations, so a schema change is a migration plus `npm run db:types` in
the same commit, never an edit to the generated row types.

## Data

Historical illegal-dump data for Pirot lives in `waste-scraper/`. Do not read a
column without reading [`docs/data-sources.md`](docs/data-sources.md) first — the
datasets carry precision flags, a default "unknown" coordinate and a
methodological gap that quietly break anything built on them. Full provenance for
every source is in `waste-scraper/IZVORI.md`.

## Conventions

- Existing code and docs are commented with *why*, not *what*. Match that density.
- Keep domain field names in Serbian where they mirror the source data
  (`naselje`, `divlja_deponija`); use English for framework-level code. The full
  rule and term list: [`docs/domain-glossary.md`](docs/domain-glossary.md).
- A domain fact learned while coding (a sensor field, a data quirk, a decided
  threshold) goes into the matching `docs/` page in the same commit. `CLAUDE.md`
  stays instructions; `docs/` holds the facts.
- Prefer additive contract changes while the frontend is being built against the
  current shape.
- Anything user-facing needs an SMS/Viber-shaped fallback path; say so explicitly
  when a design cannot have one.
