#!/usr/bin/env bash
# PostToolUse gate: after Claude edits a .ts file, run the project's only
# static check (tsc --noEmit — there is no ESLint/Prettier in this repo).
# On type errors, exit 2 to feed the diagnostics back to Claude so it can
# fix them in the same turn. Non-.ts edits are ignored (fast no-op).
set -uo pipefail

path="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

case "$path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Skip if deps aren't installed yet — don't punish a fresh checkout.
[ -d node_modules/typescript ] || exit 0

if ! out="$(npx tsc --noEmit 2>&1)"; then
  echo "tsc --noEmit reported type errors:" >&2
  echo "$out" | head -40 >&2
  exit 2
fi
exit 0
