/**
 * Keeps the places that *advertise* the tool inventory in step with the
 * registry that serves it.
 *
 * Three surfaces state a tool count or list, none of them generated: the DXT
 * manifest (what Claude Desktop shows), the README (the npm package page) and
 * the package description (the npm registry listing). All three said 23 while
 * the server served 25 — a reviewer comparing the manifest to `tools/list`
 * would have seen the mismatch before we did.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TOOL_SCHEMAS } from '../../src/handlers/tool-schemas.js';
import { PROMPT_NAMES } from '../../src/handlers/prompts.js';
import { SERVER_VERSION } from '../../src/version.js';

const root = (f: string) => resolve(__dirname, '../..', f);
const manifest = JSON.parse(readFileSync(root('manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(root('package.json'), 'utf8'));
const readme = readFileSync(root('README.md'), 'utf8');

const served = Object.keys(TOOL_SCHEMAS).sort();
const servedPrompts = [...PROMPT_NAMES].sort();

describe('published inventory matches the served registry', () => {
  it('lists every served tool in the DXT manifest, and nothing else', () => {
    const declared = (manifest.tools ?? []).map((t: { name: string }) => t.name).sort();
    expect(declared).toEqual(served);
  });

  it('gives every manifest entry a description', () => {
    for (const tool of manifest.tools ?? []) {
      expect(tool.description, `${tool.name} has no description in the manifest`).toBeTruthy();
    }
  });

  it('documents every served tool in the README', () => {
    const documented = new Set(
      [...readme.matchAll(/- \*\*`(affise_[a-z_]+)`\*\*/g)].map((m) => m[1]),
    );
    const undocumented = served.filter((name) => !documented.has(name));
    expect(undocumented, 'served but absent from the README tool list').toEqual([]);
  });

  it('states the right tool count wherever a count is stated', () => {
    const count = served.length;

    const readmeHeading = readme.match(/### 🔧 Tools \((\d+) total\)/);
    expect(readmeHeading, 'README tool heading not found — did its wording change?').not.toBeNull();
    expect(Number(readmeHeading![1]), 'README tool count').toBe(count);

    const pkgCount = String(pkg.description).match(/(\d+) tools/);
    expect(pkgCount, 'package.json description no longer states a tool count').not.toBeNull();
    expect(Number(pkgCount![1]), 'package.json description tool count').toBe(count);
  });
});

describe('published inventory matches the served prompt registry', () => {
  it('lists every served prompt in the DXT manifest, and nothing else', () => {
    const declared = (manifest.prompts ?? []).map((p: { name: string }) => p.name).sort();
    expect(declared).toEqual(servedPrompts);
  });

  it('gives every manifest prompt entry the fields the DXT schema requires', () => {
    for (const prompt of manifest.prompts ?? []) {
      expect(prompt.description, `${prompt.name} has no description in the manifest`).toBeTruthy();
      expect(prompt.text, `${prompt.name} has no text in the manifest`).toBeTruthy();
      expect(Array.isArray(prompt.arguments), `${prompt.name} has no arguments array`).toBe(true);
    }
  });

  it('states the right prompt count wherever a count is stated', () => {
    const pkgCount = String(pkg.description).match(/(\d+) analysis prompts/);
    expect(pkgCount, 'package.json description no longer states a prompt count').not.toBeNull();
    expect(Number(pkgCount![1]), 'package.json description prompt count').toBe(servedPrompts.length);
  });
});

/**
 * `serverInfo.version` was hardcoded in `src/index.ts` and drifted two
 * releases behind `package.json` — 2.0.0 on the wire against 2.1.0 in the
 * package — because nothing compared them. `src/version.ts` now derives it,
 * and these assertions keep the manifest from drifting the same way.
 */
describe('every place that states a version agrees', () => {
  it('derives serverInfo.version from package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('states the same version in the DXT manifest', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares the same licence in package.json and the DXT manifest', () => {
    expect(pkg.license).toBe(manifest.license);
  });
});
