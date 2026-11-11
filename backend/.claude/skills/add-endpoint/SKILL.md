---
name: add-endpoint
description: Procedure for adding or changing an HTTP endpoint in this NestJS backend so the generated OpenAPI contract stays usable by the frontend. Use whenever adding a route, changing a DTO, or changing a response shape.
---

# Adding an endpoint

The contract in `contracts/openapi.json` is generated from this code and is the
only thing the frontend sees. It is written by the generator, never by hand.

1. **DTO first.** Put request and response DTOs in `src/<feature>/dto/`. Give
   every field a `@ApiProperty` and, on request DTOs, `class-validator`
   decorators. Do not rely on the `@nestjs/swagger` CLI plugin for inference —
   it is deliberately disabled, because the generator runs under `ts-node` and
   would not apply it, so the committed contract would differ from the built
   one.

2. **Controller.** Give the method `@ApiOperation({ operationId })` and one
   `@ApiResponse` per status code it can return. `operationId` is what names the
   method on the generated frontend client, so choose it as a public API name
   and avoid renaming it later.

3. **Wire it up.** Feature module declares the controller; `AppModule` imports
   the feature module. An endpoint in a module nobody imports does not reach the
   contract.

4. **Regenerate and commit together.**
   ```bash
   npm run openapi:generate
   ```
   Stage `contracts/openapi.json` in the same commit as the code that changed
   it. The two drifting apart is the failure this whole setup exists to prevent.

5. **Test.** A `*.spec.ts` next to the controller, asserting the response shape
   the contract now promises.

## Breaking vs additive

CI runs `oasdiff breaking` against `main`. Additive changes (new endpoint, new
optional field) pass without ceremony. Removing a field, changing a type, or
making an existing field required will fail the build — that is intentional,
because the frontend is being written against the old shape right now. If you
need one, bump the major in `API_VERSION` (`src/openapi.config.ts`) and say so
in the PR description.

## What checks this

`.claude/hooks/guard-contract.sh` runs on every `git commit`: it regenerates the
contract, lints it against `.spectral.yaml`, and blocks the commit if the
committed contract is stale. Its error messages name the exact decorator to fix,
so there is no need to memorise the rules — write the endpoint and let it tell
you what is missing.
