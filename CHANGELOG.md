# Changelog

## 3.1.0

### Breaking

- **`affise_status` is no longer served.** It probed `OPTIONS {base_url}/healthz`,
  an unauthenticated liveness path, so it answered identically for a valid and an
  invalid API key — the failure people actually hit. Nothing replaces it: every
  other tool already maps the same transport errors (`ECONNREFUSED`,
  `ETIMEDOUT`, `ENOTFOUND`) onto a readable result envelope, so a broken
  connection tells you so on the call you meant to make.

  Two things that look like exceptions and are not. A client with no credentials
  configured still sees a tool called `affise_status` — that is the
  setup-instructions tool registered under the same name, and it is all an
  unconfigured client gets. And `performHealthCheck()` still uses the probe
  internally; only the tool is gone.

  Worth knowing before you upgrade: this was the last tool tagged as usable by
  any role, so a key with the advertiser role now registers **no tools at all**
  rather than one that told it nothing. Every endpoint in this package needs an
  admin or a partner key.

  This supersedes the 3.0.0 note below promising nothing had been removed by
  name — 3.0.0 was never published, so upgrading from 2.x brings both releases
  at once, and this removal is part of that jump.

### Changed

- Five tool descriptions were too thin to choose between — `affise_status`
  (now gone), `affise_search_offers`, `affise_smart_search`,
  `affise_offer_categories` and `affise_trafficback`. Rewritten to say what the
  tool returns and when to reach for it, with the search/smart-search overlap
  stated in both. The DXT manifest now shows the same text your client is sent
  at runtime; it previously carried a separate hand-written description for
  every tool.
- The extension listing no longer promises "automation" or offers to "manage"
  partners and advertisers. Every tool is read-only and annotated as such.
- The manifest gained `repository`, `homepage`, `documentation` and `support`,
  so the listing has a support route and a way back to the source.

### Added

- `SECURITY.md` — how to report a vulnerability, what is in scope, and what
  this server can and cannot do. It ships in the npm tarball.
- A data notice covering what the server receives, stores, forwards and for
  how long, linked from the security policy.

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
