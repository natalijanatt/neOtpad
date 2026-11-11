#!/usr/bin/env bash
#
# PreToolUse guard on `git commit`.
#
# Two things must hold before frontend code is committed:
#   1. the generated client matches the contract in this checkout, and
#   2. the app type-checks against it.
#
# (2) is the point. The generated client is what turns a contract change into a
# compile error; committing code that does not type-check throws that away.
#
# Exits 2, which Claude Code treats as blocking and reports back to the agent.
# Exit 1 would be a non-blocking error and the commit would proceed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

fail() {
  echo "$1" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || fail \
"BLOCKED: node is not on PATH, so this commit cannot be type-checked.

Install Node.js 22 or later and retry."

cd "${FRONTEND_DIR}"

[ -d node_modules ] || fail \
"BLOCKED: frontend/node_modules is missing, so this commit cannot be type-checked.

Run: cd frontend && npm install"

# 1. The generated client must match the contract in this checkout.
if ! GEN_OUTPUT="$(npm run --silent api:generate 2>&1)"; then
  fail \
"BLOCKED: the typed API client could not be generated from contracts/openapi.json.

${GEN_OUTPUT}"
fi

if ! git diff --quiet -- src/api/generated 2>/dev/null; then
  fail \
"BLOCKED: src/api/generated/ does not match contracts/openapi.json.

Regenerating the client produced a different result, so the committed client
describes an API the contract no longer does. The regenerated files are already
in your working tree.

$(git diff --stat -- src/api/generated)

Review them, make sure the calling code still fits, then stage them with the
rest of the commit:
  git add src/api/generated"
fi

# 2. The app must type-check against it.
if ! TSC_OUTPUT="$(npm run --silent typecheck 2>&1)"; then
  fail \
"BLOCKED: tsc --noEmit failed.

${TSC_OUTPUT}

Errors pointing at src/api/generated/ mean the calling code disagrees with the
contract. The fix is in the calling code, or in the backend that owns the
contract — never in the generated files."
fi

exit 0
