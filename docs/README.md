# docs/

Domain reference for the Pirot waste-management system: the facts the code has
to agree with, kept out of `CLAUDE.md` so that file stays a short set of working
instructions.

One topic per file. When something here changes, the change lands here first and
the code follows.

| File | What it holds |
|---|---|
| [`sensor-telemetry.md`](sensor-telemetry.md) | What an IoT container sensor sends, field by field, and what the backend may conclude from it |
| [`domain-glossary.md`](domain-glossary.md) | Serbian domain terms used in data, API fields and UI |
| [`data-sources.md`](data-sources.md) | The Pirot illegal-dump datasets, their columns and their traps |
| [`backend-architecture.md`](backend-architecture.md) | NestJS module layout and the database schema the code is written against |
| [`fill-forecasting.md`](fill-forecasting.md) | How a container's reading history becomes a fill curve, an expected overflow time and a confidence rating |
| [`routing-heuristic.md`](routing-heuristic.md) | How the daily route plan picks its stops (priority terms, thresholds) and orders them (cost model, insertion + 2-opt) |
| [`reports-mvp.md`](reports-mvp.md) | Implemented report workflow, staff access, API rules, setup and integration tests |
| [`report-classification.md`](report-classification.md) | Automatic triage of an incoming report: categories, sub-categories, which service answers, and why the proposal never writes to the report |
| [`media-storage.md`](media-storage.md) | Where report photos are stored, the accepted content, staged uploads and the privacy consequences of a public bucket |
| [`news-feed.md`](news-feed.md) | Utility news for citizens: feed order, the settlement filter, the one-SMS rule |
| [`disposal-search.md`](disposal-search.md) | "Gde da odložim": real drop-off sites, waste collectors, the OpenAI classifier and its keyword fallback |
| [`schema.drawio`](schema.drawio) | The same schema as a diagram, generated from the live database (`npm run db:erd`) |

Anything marked **Not yet decided** is an open question, not a fact. Do not build
on it without deciding it first and writing the decision down here.
