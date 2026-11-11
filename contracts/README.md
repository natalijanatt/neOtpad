# @hackaton/api-contract

`openapi.json` is the single source of truth for the HTTP interface between
`backend/` and `frontend/`.

## It is generated, never written

```bash
cd backend && npm run openapi:generate
```

The file is produced from the NestJS controllers and DTOs. A hand edit is
undone by the next generation run, and the pre-commit guard in
`backend/.claude/hooks/guard-contract.sh` refuses the commit before that
happens.

## How the frontend gets it

Both packages live in this repository, so the transport is git:

```bash
git pull                       # brings the new contract
cd frontend && npm run api:generate
```

`frontend/package.json` depends on this directory as `file:../contracts`, so
`node_modules/@hackaton/api-contract/openapi.json` always resolves to the
checked-out contract.

## Versioning

`version` here mirrors `info.version` in `openapi.json`, which comes from
`API_VERSION` in `backend/src/openapi.config.ts`. That constant is the only
place a human changes it; the generator propagates it.

- **minor** — additive change (new endpoint, new optional field)
- **major** — breaking change (removed field, changed type, new required field)

CI decides which one a change actually is via `oasdiff breaking`; the version
bump is a declaration, the check is the enforcement.
