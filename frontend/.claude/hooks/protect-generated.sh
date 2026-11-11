#!/usr/bin/env bash
#
# PreToolUse hook on Edit|Write|MultiEdit.
#
# src/api/generated/ is a build output of contracts/openapi.json. Editing it
# looks like it works — the type error goes away — and then the next
# 'npm run api:generate' silently reverts it, or worse, it survives locally and
# the frontend ships against a shape the backend never agreed to.
#
# Reads the tool call on stdin and denies writes to that directory.
set -euo pipefail

command -v node >/dev/null 2>&1 || {
  # Without node we cannot read the payload. Staying silent is the safe choice:
  # failing open on a guard beats failing every edit in the session.
  exit 0
}

# The payload must be read here and passed as an argument: `node` given a script
# on stdin would consume it before the script could.
PAYLOAD="$(cat)"

exec node "$(dirname "${BASH_SOURCE[0]}")/protect-generated.mjs" "${PAYLOAD}"
