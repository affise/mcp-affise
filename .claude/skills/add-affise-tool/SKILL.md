---
name: add-affise-tool
description: Scaffold a new Affise MCP tool end-to-end — implementation, registration, Vitest spec, and README inventory bump. Use when adding a new affise_* tool to the server.
disable-model-invocation: true
---

# Add an Affise MCP tool

Adds a new `affise_*` tool following the repo's established 4-part pattern. Ask the user for the tool name (`affise_<verb_noun>`), what Affise endpoint it calls, and its inputs if not given.

## Steps

1. **Implement** the tool logic in `src/tools/<name>.ts` (or extend an existing tool file if it's a close sibling). Reuse:
   - the shared HTTP client in `src/services/` (do not call `axios` directly),
   - input validation/sanitization helpers in `src/services/` — coerce numeric-keyed objects back to arrays,
   - the `{columns, rows, dropped_columns?}` compaction envelope from `src/utils/` for tabular results; the checked-envelope shape for single-entity results.

2. **Register** it in `src/handlers/enhanced-tools.ts`: add a tool definition with a complete input schema (declare every argument, mark required ones) and wire the handler in the `CallTool` switch. Match the surrounding style of the existing 23 tools.

3. **Test** in `tests/unit/<name>.test.ts` (Vitest, axios mocked). Cover at minimum: happy path, an error / response-shape case, and input validation. Mirror an existing spec like `tests/unit/affise_partner_balance.test.ts`.

4. **Document**: add the tool to the inventory in `README.md` under the right group and **bump the "🔧 Tools (N total)" count**.

## Verify before finishing

```bash
npm run build:unsafe   # tsc must pass
npm test               # all specs green, including the new one
```

Then summarize: files touched, the new tool count, and the one-line README entry added. Optionally hand the change to the `mcp-tool-reviewer` subagent for a secret-safety/contract pass.
