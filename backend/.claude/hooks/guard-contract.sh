#!/usr/bin/env bash
#
# PreToolUse guard on `git commit`.
#
# Regenerates the OpenAPI contract from the current source and refuses the
# commit when the committed contract does not match what the code produces.
# Without this, the backend can ship a controller change that never reaches
# contracts/openapi.json, and the frontend agent keeps generating its client
# from a stale document on another machine.
#
# Exits 2 on failure: Claude Code treats exit 2 as blocking and feeds stderr
# back to the agent. Exit 1 would be reported as a non-blocking error and the
# commit would go through.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"
SPEC_REL="contracts/openapi.json"

fail() {
  echo "$1" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || fail \
"BLOCKED: node is not on PATH, so the OpenAPI contract cannot be regenerated
and this commit cannot be verified.

Install Node.js 22 or later and retry."

cd "${BACKEND_DIR}"

[ -d node_modules ] || fail \
"BLOCKED: backend/node_modules is missing, so the contract cannot be regenerated.

Run: cd backend && npm install"

HASH_BEFORE=""
if [ -f "${REPO_ROOT}/${SPEC_REL}" ]; then
  HASH_BEFORE="$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "${REPO_ROOT}/${SPEC_REL}")"
fi

# 1. Regenerate. Deterministic by construction, so an unchanged source
#    produces a byte-identical file and no diff.
if ! GENERATE_OUTPUT="$(npm run --silent openapi:generate 2>&1)"; then
  fail \
"BLOCKED: the OpenAPI contract could not be generated, so the API surface of
this commit is unknown.

${GENERATE_OUTPUT}

Fix the error above, then run: cd backend && npm run openapi:generate"
fi

# 2. Lint. The frontend builds against a Prism mock made from this document,
#    so missing examples and undescribed responses are build failures here.
if ! LINT_OUTPUT="$(npm run --silent contract:lint 2>&1)"; then
  fail \
"BLOCKED: the regenerated contract does not satisfy .spectral.yaml.

${LINT_OUTPUT}

Each message names the decorator to fix. Fix the DTOs and controllers, then
run: cd backend && npm run openapi:generate && npm run contract:lint"
fi

cd "${REPO_ROOT}"

# 3. Untracked contract: it exists but git does not know about it yet.
if ! git ls-files --error-unmatch "${SPEC_REL}" >/dev/null 2>&1; then
  if git diff --cached --name-only -- "${SPEC_REL}" | grep -q .; then
    exit 0
  fi
  fail \
"BLOCKED: ${SPEC_REL} is not tracked by git. The contract is the artefact the
frontend consumes; leaving it untracked means the other side has nothing to
generate from.

Run: git add ${SPEC_REL}"
fi

# 4. The real check: regeneration changed the working tree, so the contract in
#    this commit is out of date with the code in this commit.
if ! git diff --quiet -- "${SPEC_REL}"; then
  DIFF_STAT="$(git diff --stat -- "${SPEC_REL}")"
  DIFF_BODY="$(git diff -- "${SPEC_REL}" | head -60)"
  fail \
"BLOCKED: ${SPEC_REL} is out of date with the source.

Regenerating it from the current controllers produced a different document,
which means this commit would change the API without changing the contract the
frontend generates its client from.

${DIFF_STAT}

${DIFF_BODY}

The regenerated file is already in your working tree. Review the diff above,
then stage it as part of this commit:
  git add ${SPEC_REL}

If the diff is not what you intended, fix the controller or DTO instead and
run: cd backend && npm run openapi:generate"
fi

# 5. The contract matches the index, but regeneration changed the file on disk:
#    something had hand-edited it. The edit is gone now, and saying so is
#    cheaper than letting someone wonder where it went.
if [ -n "${HASH_BEFORE}" ]; then
  HASH_AFTER="$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "${REPO_ROOT}/${SPEC_REL}")"
  if [ "${HASH_BEFORE}" != "${HASH_AFTER}" ]; then
    echo "NOTE: ${SPEC_REL} had been modified by hand. Regeneration restored it to what the source produces, and the commit is allowed to proceed with that version. To change the contract, change the controller or DTO." >&2
  fi
fi

exit 0
