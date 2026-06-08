#!/usr/bin/env bash
# PreToolUse guard: refuse edits to credential files (.env holds the Affise
# API key). Reads the hook payload as JSON on stdin and blocks with exit 2,
# which surfaces the stderr message back to Claude. Example/sample env
# templates are allowed since they carry no real secrets.
set -euo pipefail

path="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

case "$path" in
  *.env.example|*.env.sample|*.env.template) exit 0 ;;
  *.env|*.env.*|*/.env)
    echo "Blocked: '$path' holds credentials (Affise API key / encryption secret). Edit it manually outside Claude." >&2
    exit 2
    ;;
esac
exit 0
