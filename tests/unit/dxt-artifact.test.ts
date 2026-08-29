/**
 * `mcp-affise.dxt` is a tracked binary (see .gitignore) that users install
 * directly, so a stale one ships a stale server to everyone who takes that
 * route. The tracked artifact went two releases stale — 2.1.0 with 23 tools
 * against a 3.0.0 server serving 25 — because nothing compared the bundle to
 * the repo it was built from.
 *
 * Rebuild with `npm run build-dxt` when this fails. Note that script runs
 * `npm prune --omit=dev` against the working tree; build in a disposable copy
 * or expect to reinstall devDependencies afterwards.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = (f: string) => resolve(__dirname, '../..', f);
const DXT = root('mcp-affise.dxt');
const manifest = JSON.parse(readFileSync(root('manifest.json'), 'utf8'));

const embeddedManifest = () =>
  JSON.parse(execFileSync('unzip', ['-p', DXT, 'manifest.json'], { encoding: 'utf8' }));

describe('the tracked DXT artifact matches the repo it was built from', () => {
  it('is present', () => {
    expect(existsSync(DXT), `no DXT at ${DXT} — it is tracked and must not be deleted`).toBe(true);
  });

  it('was built from the current manifest version', () => {
    expect(embeddedManifest().version).toBe(manifest.version);
  });

  it('carries the current tool inventory', () => {
    const embedded = embeddedManifest().tools.map((t: { name: string }) => t.name).sort();
    const declared = manifest.tools.map((t: { name: string }) => t.name).sort();
    expect(embedded).toEqual(declared);
  });

  it('carries the current prompt inventory', () => {
    const embedded = (embeddedManifest().prompts ?? []).map((p: { name: string }) => p.name).sort();
    const declared = (manifest.prompts ?? []).map((p: { name: string }) => p.name).sort();
    expect(embedded).toEqual(declared);
  });

  it('ships no source, tests or local environment files', () => {
    const entries = execFileSync('unzip', ['-Z1', DXT], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split('\n')
      .filter((e) => e && !e.startsWith('node_modules/'));
    const leaked = entries.filter((e) => /^(src\/|tests\/|specs\/|certs\/|scripts\/|\.env)/.test(e));
    expect(leaked, 'files that must never ship inside the extension').toEqual([]);
  });
});
