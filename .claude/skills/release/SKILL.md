---
name: release
description: Pre-flight and trigger an npm release of @affise/mcp-server via the publish.yml GitHub Actions workflow. Use when publishing a new version to npm.
disable-model-invocation: true
---

# Release @affise/mcp-server

Publishes via the `publish.yml` workflow (GitHub-hosted, provenance, `NPM_TOKEN` secret). The two previous releases failed on a stale lockfile and a wrong token — so **pre-flight locally in the CI toolchain before dispatching**.

Ask the user for the bump if not given: `patch` / `minor` / `major` / `none` (`none` publishes the current `package.json` version), and the dist-tag (`latest` / `next` / `beta`).

## 1. Pre-flight (catch what broke before)

Run in `node:22` so resolution matches the runner exactly — this is how the esbuild lockfile drift was caught:

```bash
docker run --rm -v "$PWD":/app -w /app -e NODE_ENV=test node:22 bash -c \
  "npm ci --no-audit && npm run build:unsafe && npm test"
```

- `npm ci` failing with "Missing … from lock file" → the lockfile is out of sync. Regenerate it **in the container** (`rm -f package-lock.json && npm install`), commit, and re-run.
- If Docker is unavailable, run `npm ci && npm run build:unsafe && npm test` locally, but be aware platform-specific dep resolution may differ from CI.

Also confirm `git status` is clean and you're on the intended ref (default `main`).

## 2. Dispatch

```bash
gh workflow run publish.yml -f ref=main -f release=<bump> -f dist_tag=<tag>
```

## 3. Watch & verify

```bash
gh run list --workflow=publish.yml --limit 1   # grab the run id
gh run watch <run-id>
npm view @affise/mcp-server version dist-tags   # confirm it landed
```

If `Publish to npm` returns **403 "You may not perform that action with these credentials"**, the pipeline is fine — it's the `NPM_TOKEN` secret: it must be an Automation token (or granular all-packages R/W) for the **affise** npm org. Code/workflow changes won't fix it.
