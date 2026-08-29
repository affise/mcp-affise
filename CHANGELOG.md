# Changelog

## 3.0.0

Re-baselined onto the current internal server. The runtime underneath changed
generation and the tool inventory grew; nothing you call by name has been
removed.

### Breaking

- **Argument validation now answers with a JSON-RPC `-32602` error instead of a
  result envelope.** Previously an invalid enum value or an unknown tool name
  came back as a normal result whose body carried `VALIDATION_ERROR` or
  `TOOL_NOT_FOUND`. Both are now protocol-level errors, which is what the MCP
  spec asks for. If you parse tool results looking for those codes, that branch
  will stop being reached — read the JSON-RPC error instead.
- **`package.json` now declares `MIT`.** It said `ISC` while the bundled
  `LICENSE` file, and every other statement of the licence, said MIT. MIT was
  always the intent; the metadata was wrong. Nothing about your rights changes,
  but automated licence scanners will see a different string than before.

### Added

- **`affise_stats_compare`** — period-over-period comparison with the range
  auto-aligned, so a month-to-date query compares against the same day-range of
  the prior period rather than a full month.
- **`affise_affiliate_analysis`** — one call for a single affiliate's account
  review: KPIs, per-offer breakdown, trafficback split and rule-based insights.
- **Role playbooks**, served as resources under `skill://affise/*` — affiliate
  manager, advertiser manager, affiliate/publisher, and business owner. They
  need no credentials and are available immediately after install, before you
  enter an API key.
- **Server `instructions`** in the `initialize` response: which tool answers
  which kind of question, the auth scoping, and the API limits worth knowing
  before you hit them.
- **`outputSchema`** on ten tools, so hosts that render structured content get
  the data as data rather than as text.
- **`npm run health`** — an out-of-band diagnostic for when the server will not
  start and you therefore cannot reach `affise_status`.

### Changed

- Every tool now carries a `title` and the full set of behaviour annotations
  (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), so a
  client can present them properly and auto-approve reads.
- The DXT manifest now lists the prompts alongside the tools.

### Fixed

- **Every credential-using tool was failing on stdio** with "baseUrl or apiKey
  not provided". The configuration object exposes its fields as accessors, and
  an object spread dropped the API key silently.
- **The six-month range guard rejected legal ranges** anywhere west of UTC and
  let over-long ones through, because it read UTC-parsed dates through local
  accessors. It also counted calendar months alone, so a 210-day span passed as
  "six months" and failed server-side instead of locally.
- **The health check reported healthy without checking anything** when invoked
  through a symlink — which is what `npm link` and most release layouts do.
- A tool description carried a real advertiser ID as an example.
