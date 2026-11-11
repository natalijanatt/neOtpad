# Reports and triage MVP

The backend accepts anonymous web reports and staff-entered telephone or intermediary reports. Dispatchers review reports, select a response, reject or mark duplicates, and record completed work. No citizen account, GPS or photograph is required. Photographs are supported: they are uploaded first and claimed by the submission that follows, and a report without one is still a complete report - see [`media-storage.md`](media-storage.md). SMS/Viber gateway delivery, notifications, points and route generation remain future work.

## Setup

1. Apply migrations, including `20260918121200_reports_workflow.sql`, through the existing Supabase migration workflow. Do not reset a populated database to apply this feature. The new constraints fail on incompatible legacy reports; review those records before retrying instead of silently rewriting their history.
2. Set `JWT_SECRET` in `backend/.env` or the deployment environment. Generate a unique secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The API requires at least 32 characters and has no runtime default. OpenAPI generation supplies its own non-runtime value and still needs no database.
3. Provision staff from `backend/`: set `STAFF_EMAIL`, `STAFF_NAME`, `STAFF_ROLE` (`admin`, `dispecer`, `vozac`) and `STAFF_PASSWORD` (12–128 characters), then run `npm run provision:staff`. Pass the password through a temporary environment variable or private local environment file, not command-line arguments. Remove the provisioning password after use. Existing accounts are never overwritten. There is no public staff signup.
4. Optionally provision an intermediary: set `INTERMEDIARY_NAME`, `INTERMEDIARY_ROLE`, and optionally `INTERMEDIARY_COMMUNITY_ID` and `INTERMEDIARY_PHONE` (E.164), then run `npm run provision:intermediary`. Record the returned UUID. Repeating the command creates another intermediary; it is not an upsert.
5. Start the backend and use `/docs`. `POST /auth/login` accepts `{ "email": "...", "password": "..." }` and returns `accessToken` and `expiresIn`. Send `Authorization: Bearer <token>` for staff endpoints. Tokens expire after 30 minutes; login again. Each protected request checks the current account activation and role.

Passwords use salted scrypt; JWT verification pins algorithm, issuer and audience. The approach follows [NestJS authentication](https://docs.nestjs.com/security/authentication) and [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Password resets and account management are not public endpoints in this slice.

## API

| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` | Public, rate-limited |
| GET | `/auth/me` | Active staff |
| POST | `/reports` | Public, anonymous, rate-limited |
| POST | `/reports/assisted` | Dispatcher/admin |
| GET | `/reports` | Dispatcher/admin |
| GET | `/reports/{id}` | Dispatcher/admin, includes history |
| POST | `/reports/{id}/triage` | Dispatcher/admin |
| POST | `/reports/{id}/resolve` | Dispatcher/admin |
| POST | `/reports/{id}/classify` | Dispatcher/admin, recomputes the automatic triage proposal ([report-classification.md](report-classification.md)) |
| GET | `/settlements` | Public name/ID lookup |
| GET | `/containers` | Dispatcher/admin, active container lookup. The handler now lives in the `containers` module and answers the fleet views too, but without `sa_stanjem` it returns the same reference shape this wizard has always read |
| GET | `/intermediaries` | Dispatcher/admin, active name/ID lookup |

Reports carry a `klasifikacija` object in the queue and detail responses: the
newest automatic triage proposal, or null. It is advisory and changes nothing
about the rules below — `tip` and `tip_obrade` are still only ever written by a
dispatcher through `/triage`.

Drivers cannot read or manage report queues. There is no public report listing or receipt-code lookup. Public receipt codes are telephone references, not access credentials. DTOs explicitly select response fields; citizen identity, intermediary phone numbers and staff password hashes are not serialized.

The report queue filters by `status`, `naselje_id`, `tip`, `kanal` and exact `kratki_kod`. `page` defaults to 1 and `limit` to 25, capped at 100. Ordering is submission time descending and UUID descending. Responses include `hasMore`. Pagination is not a frozen snapshot: new submissions can shift page boundaries. Lookups support `search`; container lookup also supports `naselje_id`.

## Submission and retries

Both creation endpoints require `Idempotency-Key`, a client-generated UUID. Reuse it for retries with the same request body. The key is scoped to public web submissions or the acting staff UUID. Content hashes ignore JSON property order. A replay returns the original creation receipt, including status `nova`, even if the report has since been triaged. A changed body with the same key returns 409. Concurrent retries create one report and one creation-history row. Keys persist with reports.

Example public request:

```http
POST /reports
Content-Type: application/json
Idempotency-Key: 44444444-4444-4444-8444-444444444444

{
  "tip": "prelivanje",
  "naselje_id": "aaaaaaaa-0002-4000-8000-000000000002",
  "opis_lokacije": "Kod osnovne skole"
}
```

The receipt contains only `kratki_kod`, `status`, and `primljena_at`. Staff can find its internal ID by filtering `/reports` by the code. This feature does not collect citizen phone numbers. A dispatcher entering a telephone report uses `/reports/assisted` with `kanal: "telefon"`; for an intermediary use `kanal: "posrednik"` and an active `posrednik_id`.

Submission requires `tip` plus coordinates, an existing settlement or an active container. `drugo` requires `opis`. A container supplies its settlement; contradictory settlement/container IDs fail. Coordinates must be numeric WGS84 latitude/longitude. Optional properties may be omitted, but not explicitly set to null. Staff-only fields and unknown fields are rejected.

`preciznost_lokacije` defaults to `gps` for supplied coordinates, `opisana` for a container or directions, and `naselje` for settlement alone. Callers must explicitly use `opisana` for approximate coordinates. Settlement precision never manufactures a coordinate. Referencing a container preserves that reference instead of copying its coordinates into the report.

## Triage and resolution

| Current | Decision | Result |
|---|---|---|
| nova | confirm / reject / duplicate | potvrdjena / odbijena / duplikat |
| potvrdjena | refine confirmation / reject / duplicate | potvrdjena / odbijena / duplikat |
| potvrdjena | resolve with completion note | resena |
| odbijena / duplikat / resena | any change | 409 |

Every staff mutation requires `verzija` from the last read and a nonblank `razlog`. Concurrent edits yield one successful update and a 409 for stale versions. Confirmation can refine type, size, location and description. The first confirmation timestamp is preserved. Rejection/duplicate requests cannot simultaneously edit report content. A new occurrence after closure is a new report.

Confirmation requires `tip_obrade`:

- `odvoz`: full/overflowing container, identified by `kontejner_id`, and not a large problem.
- `ciscenje`: illegal dump, overflow or another described problem; dedicated clean-up path.
- `odrzavanje`: damaged/missing container or another described problem.
- `provera_lokacije`: investigate before assigning work; may retain only the settlement.

An actionable response needs a container, coordinates or directions. A report assigned to `provera_lokacije` must be refined to an actionable response before resolution. Manual `prioritet` is 1 (most urgent) through 5, default 3 on first confirmation. It is separate from future risk scores. Rejected and duplicate reports have no priority. Routing must select confirmed reports with `tip_obrade = 'odvoz'`, never every report carrying a priority.

Example confirmation, followed by resolution with the returned version:

```json
{
  "verzija": 1,
  "odluka": "potvrdjena",
  "tip_obrade": "odvoz",
  "kontejner_id": "cccccccc-0001-4000-8000-000000000001",
  "razlog": "Lokacija proverena telefonom."
}
```

```json
{ "verzija": 2, "razlog": "Kontejner ispraznjen; okolni otpad uklonjen." }
```

Duplicate decisions require `duplikat_od` referencing another non-rejected, non-duplicate report. Self-links, chains and cycles are rejected. A report already referenced by duplicates cannot itself become a duplicate. Staff mutations use a transaction-scoped advisory lock to make these cross-row checks safe against concurrent changes. This deliberately serializes triage for the small MVP workload; it does not serialize public submissions.

Every creation and staff action appends `prijava_istorija` in the same transaction as the report change. History holds actor ID, reason, timestamp, resulting version and explicit before/after report snapshots. The database rejects history updates/deletes. There is no hard-delete endpoint.

### Confirming a dump writes to the register

A report confirmed as `divlja_deponija` is an observation of the same ground the
illegal-dump register describes, so it is filed there — otherwise recurrence at a
spot, the signal that makes a black spot, would only ever be measured over CSV
data that ends in 2024. The link is `prijava.kanonska_id`, returned by the API,
and the write happens in the decision's own transaction: a confirmed dump missing
from the register and a register entry for a rejected report are the same bug
seen from two sides.

| After the decision | What the register gets |
|---|---|
| `potvrdjena`, `tip = divlja_deponija` | a `prijava` observation on the nearest registry site within **200 m**, or on a site opened for it (`P-nnnn`) |
| `potvrdjena`, any other `tip` | nothing; a previous observation and any site opened for it are removed |
| `odbijena` / `duplikat` | the same removal — a rejected report is not evidence that anything is there |
| `resena` | a second observation, `sanacija`, beside the first |

Consequences worth knowing:

- **The match is recomputed on every confirmation.** The rural path is why: an
  SMS with no coordinate is confirmed as `provera_lokacije` and opens a site with
  no point either; when the location is verified, the second confirmation finds
  the registry dump that was there all along and the placeholder is deleted. One
  pile, one record.
- **A report with no coordinate still registers**, as `geo_preciznost =
  'nepoznato'` with its settlement and no point. Substituting the village
  centroid would be indistinguishable from a surveyed location once stored
  (`docs/data-sources.md`).
- **Only a site the reports opened can be deleted**, and only when it has no
  locations and no observations left. A row that came from a CSV is unreachable
  by that delete.
- **The proposal from the classifier never triggers any of this.** The trigger is
  the dispatcher's confirmation, for the reason
  [`report-classification.md`](report-classification.md) gives: a model's guess
  would be writing into the evidence the risk map is built from.

## Rate limiting and deployment

Counters live in `app.api_limit` and are incremented atomically, so separate API instances share limits. Identities are HMAC-hashed, not stored as raw IPs/emails. Defaults are 10 public report attempts per IP per 10 minutes, 20 login attempts per IP per 15 minutes, and 10 login attempts per normalized email per 15 minutes. Invalid requests also consume the IP allowance. IP rejections include `Retry-After`; all limit responses include `retryAfter` in the body. Counters reset after expiry. Periodically run `npm run cleanup:rate-limits` to remove expired identities; no in-process scheduler is required.

`TRUST_PROXY_HOPS` defaults to 0. Set it only after verifying the deployment's proxy chain and that the origin cannot be reached through a shorter untrusted path. The app does not trust arbitrary forwarded IP headers. Leaving it at 0 behind a proxy shares the public allowance across clients of that proxy. Staff endpoints use bearer authentication and no-store responses.

## Verification

From `backend/`:

```sh
npm test -- --runInBand
npm run test:integration
npm run typecheck
npm run build
npm run openapi:generate
npm run contract:lint
```

`test:integration` creates a randomly named `reports_test_*` database on local Postgres, applies all migrations and seed, runs HTTP/database tests and drops only the database it created. It never resets the application database and rejects non-local admin URLs. Default admin URL is the local Supabase instance on port 54322; override with `TEST_ADMIN_DATABASE_URL` for a dedicated local test server. The server needs PostGIS, btree_gist, database-creation privileges and the Supabase role names `anon`, `authenticated`, `service_role` used by the existing migrations.

`npm run db:types:test` generates database types from the same disposable schema. Integration coverage includes the telephone-to-resolution scenario, anonymous/intermediary reports, permissions, invalid inputs, concurrent edits and retries, duplicate cycles, immutable history, rollback after audit failures and distributed counter behavior.
