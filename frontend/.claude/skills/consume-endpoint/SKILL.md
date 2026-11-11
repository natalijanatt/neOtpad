---
name: consume-endpoint
description: Procedure for calling a backend endpoint from this React app through the generated, contract-typed client. Use whenever adding a data fetch, a mutation, or wiring a component to the API.
---

# Calling an endpoint

Every HTTP call goes through `api` from `src/api/client.ts`. It is typed from
`contracts/openapi.json`, so a wrong path, method, body or response field is a
compile error rather than a runtime surprise on someone else's machine.

1. **Check the contract has it.**
   ```bash
   node -e "console.log(Object.keys(require('./node_modules/@hackaton/api-contract/openapi.json').paths))"
   ```
   Not there means the backend has not built it. That is a backend change; it
   cannot be added from this side, and stubbing it with a hand-written type only
   hides the gap until integration.

2. **Call it.**
   ```ts
   import { api } from '../api/client';

   const { data, error } = await api.GET('/health');
   ```
   Path and method autocomplete from the contract. `data` is the typed success
   body, `error` the typed error body — both need handling; `data` is
   `undefined` when the request failed.

3. **Name types off the contract, never redeclare them.**
   ```ts
   import type { components } from '../api/generated/schema';
   type Health = components['schemas']['HealthResponseDto'];
   ```
   A locally written interface stops tracking the backend the moment it is
   written, which is the exact drift this setup exists to catch.

4. **Run against the mock.**
   ```bash
   npm run mock     # Prism on 4010, the client's default base URL
   npm run dev
   ```
   Responses come from the `example` values in the contract. The backend does
   not have to be running, or even to exist yet.

## When the types fight you

A type error inside `src/api/generated/` is the contract disagreeing with the
code, and the fix is never in that directory — a PreToolUse hook rejects edits
there. Either the calling code adapts, or the backend changes the DTO and
regenerates the contract.

If the contract looks stale, `git pull && npm run api:generate` re-syncs it.
