#!/bin/bash
# Cloud sessions start from a fresh clone: install the dev dependencies so `npm test` and the smoke test run straight away.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
[ -x node_modules/.bin/vitest ] || npm ci --no-audit --no-fund --silent
