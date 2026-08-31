# Security Policy

What this server receives, stores and forwards — and for how long — is described in the
[MCP data notice](https://affise.com/affise-mcp-server/privacy/). It covers the self-hosted
package as well as the hosted endpoint.

## Reporting a vulnerability

Email **support@affise.com** with `SECURITY` at the start of the subject line. Please report privately first — do not open a public GitHub issue for something exploitable.

We aim to acknowledge a report within five business days. If you have heard nothing after that, send a follow-up; a silent inbox is a bug on our side, not a verdict on your report.

### Never send us a live credential

Do not include a real Affise API key, a session token, or real account data in a report — not in the body, not in a screenshot, not in an attached log. If a key is what demonstrates the issue, say so and describe its role; we will arrange a safe way to reproduce.

If you believe a key has already been exposed, say that first and in one line, so we can rotate before we finish reading.

### What makes a report easy to act on

- Which surface: the `@affise/mcp-server` npm package, the `.dxt` bundle, or the hosted endpoint at `mcp.affise.com`.
- The version — `npm ls @affise/mcp-server`, or the commit if you built from source.
- What you did, what happened, and what you expected instead.
- What an attacker gains. We would rather read a modest, precise impact statement than a severity label.

## Scope

**In scope**

- This repository, and the `@affise/mcp-server` package published from it.
- The DXT bundle (`mcp-affise.dxt`) and its manifest.
- The hosted MCP endpoint at `https://mcp.affise.com/mcp`.

**Out of scope** — still welcome at support@affise.com, just as an ordinary ticket:

- The Affise platform and its REST API. This server forwards requests to it and adds no data of its own; a finding in the platform is a platform report.
- Anything that presupposes an already-compromised machine or MCP client. The stdio server runs locally, under your account, with a key you supply — it is inside your trust boundary by design, and cannot defend against a host that is already hostile.
- Volumetric findings against the hosted endpoint (request floods, resource exhaustion by repetition).
- Missing hardening headers on responses that carry no content and no credentials.

## Supported versions

| Version | Security fixes |
| --- | --- |
| 3.x | Yes |
| 2.x and earlier | No — upgrade to 3.x |

The hosted endpoint always runs a single deployed version; there is nothing for you to upgrade there.

## What this server can and cannot do

Worth knowing before you triage a finding, and enough on its own to rule some classes out:

- **The tool surface is read-only.** There is no code path that creates, edits or deletes an offer, partner, payout or conversion. Twenty-three tools are `GET` reads. The exception is `affise_offer_tracking_link`, which `POST`s an offer id, an affiliate id and any sub-IDs you pass to `/3.0/admin/offer/{id}/tracking-link` and returns the URL Affise builds from them; it submits no other content. All 24 are annotated `readOnlyHint` — including that one, which is worth knowing if you are judging the annotation against the HTTP method rather than against the effect.
- **It sees exactly what your key sees.** The server holds no permissions of its own. An admin key reaches network-wide data; an affiliate key reaches only that affiliate's. Authorisation is the Affise API's, not ours.
- **The API key is read from the environment and then removed from it.** `SecureConfigManager` deletes `AFFISE_API_KEY` from `process.env` after the first load, so a later dependency cannot read it back out of the process environment.
- **Nothing is sent anywhere else.** No telemetry, no analytics, no third-party endpoint. The only outbound host is the Affise base URL you configure.
- **In its default mode nothing about a query is logged.** Tool arguments and results are not written out, and error paths are sanitised first. The API key travels in a request header, so it never appears in a logged URL either way. One caveat worth reporting *to yourself* rather than to us: setting `NODE_ENV=development` deliberately turns on request URL and form-body logging to stderr, which includes filter values and sub-IDs. That is a debugging aid — not something to leave on a shared machine.

## Credits

If you would like to be credited for a report, say so and tell us the name to use. If you would rather not be named, that is the default.
