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

  it('shows the same description on install that the server sends at runtime', () => {
    // The manifest carried an independently hand-written description for all
    // 25 tools: Claude Desktop showed one text on install while `tools/list`
    // sent another, and some manifest lines claimed behaviour the schema did
    // not. Truthiness alone could not see it — only equality can.
    const drifted = (manifest.tools ?? [])
      .filter((t: { name: string; description: string }) => {
        const schema = (TOOL_SCHEMAS as Record<string, { description?: string }>)[t.name];
        return schema && schema.description !== t.description;
      })
      .map((t: { name: string }) => t.name);
    expect(drifted, 'manifest descriptions that disagree with the served ones').toEqual([]);
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

    // SECURITY.md counts the surface twice — how many are GET reads, and how
    // many carry readOnlyHint. Dropping affise_status updated README, manifest
    // and package.json and left both of these a tool behind.
    const security = readFileSync(resolve(__dirname, '../..', 'SECURITY.md'), 'utf8');

    const WORDS: Record<string, number> = {
      'Twenty-one': 21, 'Twenty-two': 22, 'Twenty-three': 23,
      'Twenty-four': 24, 'Twenty-five': 25, 'Twenty-six': 26,
    };
    const getReads = security.match(/(\w+(?:-\w+)?) tools are `GET` reads/);
    expect(getReads, 'SECURITY.md no longer states a GET-read count').not.toBeNull();
    expect(WORDS[getReads![1]], `SECURITY.md GET-read count ("${getReads![1]}")`)
      .toBe(count - 1); // every tool but affise_offer_tracking_link, which POSTs

    const annotated = security.match(/All (\d+) are annotated `readOnlyHint`/);
    expect(annotated, 'SECURITY.md no longer states an annotated count').not.toBeNull();
    expect(Number(annotated![1]), 'SECURITY.md readOnlyHint count').toBe(count);
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

  it('names the same licence in the README that ships with the package', () => {
    // README.md is the npm package page and ships at the root of both the
    // tarball and the DXT bundle. The licence was changed in package.json,
    // manifest.json and LICENSE while the README kept saying ISC — and the
    // pkg-vs-manifest assertion could not see it. npm publishes are permanent.
    const stated = readme.match(/licensed under the (\w+) License/);
    expect(stated, 'README no longer states a licence — did its wording change?').not.toBeNull();
    expect(stated![1], 'README licence').toBe(pkg.license);
  });

  it('declares the same licence in package.json and the DXT manifest', () => {
    expect(pkg.license).toBe(manifest.license);
  });
});

/**
 * The listing copy is a capability claim, and a reviewer checks it against the
 * tool set. The manifest promised "advanced analytics and automation" and
 * offered "manage partners/advertisers" on a surface where no code path
 * creates, edits or deletes anything, and carried "automation" as a keyword.
 */
describe('listing copy matches what the tools can do', () => {
  const copy = `${manifest.description} ${manifest.long_description}`.toLowerCase();

  it('does not promise automation on a read-only surface', () => {
    for (const word of ['automate', 'automation', 'automating']) {
      expect(copy, `manifest copy promises "${word}"`).not.toContain(word);
    }
    expect(
      manifest.keywords.map((k: string) => k.toLowerCase()),
      'manifest keywords',
    ).not.toContain('automation');
  });

  it('does not offer to manage anything', () => {
    for (const claim of ['manage partner', 'manage advertiser', 'manage offer']) {
      expect(copy, `manifest copy offers to "${claim}"`).not.toContain(claim);
    }
  });

  it('gives the listing the contact and provenance fields it renders', () => {
    // Absent, the directory card shows an extension with no support route and
    // no way back to the source.
    for (const field of ['homepage', 'documentation', 'support'] as const) {
      expect(manifest[field], `manifest.${field}`).toMatch(/^https:\/\//);
    }
    expect(manifest.repository?.url, 'manifest.repository.url').toMatch(/^https:\/\//);
  });
});
