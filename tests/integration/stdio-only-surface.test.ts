/**
 * stdio-only enforcement gate.
 *
 * This package is the public, stdio-only distribution. The HTTP transport,
 * its OAuth/JWT middleware, its Express routes and the MCP-UI widget surface
 * all live in the internal server and must never arrive here — not reachable
 * from the entry point, and not sitting in `src/` where `tsc` would emit them
 * into the published tarball regardless of whether anything imports them.
 *
 * The obvious check — grepping for "oauth" — is defeated by a rename. These
 * assertions are mechanical instead:
 *
 *  1. walk the real import graph and fail on a banned directory being reachable
 *  2. fail on a banned directory existing at all, reachable or not, because
 *     `tsconfig.include` is `src/**\/*` so every file under it ships
 *  3. fail on an HTTP-server package entering the runtime dependencies
 *  4. pin the runtime dependency set exactly
 *  5. fail on a new module that no declared entry point reaches — dead weight
 *     in the tarball is how an unreferenced transport would hide
 *
 * Verified by regression: adding `src/transports/http-transport.ts` and
 * importing it from `src/index.ts` turns 1, 2 and 5 red.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');

/** Directories whose contents belong to the internal HTTP server only. */
const BANNED_DIRS = ['transports', 'middleware', 'routes', 'widgets'];

/**
 * Packages that only a network-facing server needs. Any of these in runtime
 * `dependencies` means an HTTP surface came back, whatever the files are called.
 */
const HTTP_SERVER_PACKAGES = [
  'express',
  'cors',
  'jsonwebtoken',
  'ioredis',
  'express-rate-limit',
  'prom-client',
  'inquirer',
];

/** Exactly what a stdio MCP server needs, and nothing else. */
const EXPECTED_RUNTIME_DEPS = [
  '@modelcontextprotocol/sdk',
  'axios',
  'dotenv',
  'zod',
];

/**
 * Every root the build is allowed to have. `index.ts` is the MCP server;
 * `health-check.ts` is the out-of-band diagnostic (`npm run health`), which a
 * user whose server will not start cannot reach through an MCP tool.
 */
const ENTRY_POINTS = ['src/index.ts', 'src/health/health-check.ts'];

/**
 * Modules deliberately left unreachable.
 *
 * `affise-client.ts` carries the `deriveRole` taxonomy. The internal server
 * uses it to filter `tools/list` by the key's role; this package deliberately
 * does not, so that the advertised inventory is the same for every user
 * regardless of which key they hold. The taxonomy stays, inert and unit-tested,
 * so the two trees do not diverge further. Do not wire it up.
 */
const INERT_BY_DECISION = ['src/services/affise-client.ts'];

/** Relative specifier -> absolute .ts path, mirroring how tsc resolves `./x.js`. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (!spec.startsWith('.')) return null;
  let p = resolve(dirname(fromFile), spec);
  if (p.endsWith('.js')) p = p.slice(0, -3) + '.ts';
  for (const candidate of [p, `${p}.ts`, join(p, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Static imports (`import ... from`, `export ... from`), dynamic `import()`,
 * and side-effect `import './x.js'`. Over-matching (a specifier quoted inside
 * a comment) can only widen the graph, which is the safe direction here.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function importGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = entries.map((e) => join(ROOT, e));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const pattern of SPECIFIER_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        const target = resolveSpecifier(match[1], file);
        if (target) queue.push(target);
      }
    }
  }
  return seen;
}

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('stdio-only surface', () => {
  it('declares every entry point it claims to have', () => {
    for (const entry of ENTRY_POINTS) {
      expect(existsSync(join(ROOT, entry)), `declared entry point ${entry} is missing`).toBe(true);
    }
  });

  it('reaches no HTTP, OAuth or widget module from any entry point', () => {
    const reachable = [...importGraph(ENTRY_POINTS)].map(rel);
    const offenders = reachable.filter((f) =>
      BANNED_DIRS.some((d) => f.startsWith(`src/${d}/`)),
    );
    expect(offenders, 'HTTP/OAuth/widget modules reachable from an entry point').toEqual([]);
  });

  it('ships no HTTP, OAuth or widget module even unreachable', () => {
    // tsconfig.include is `src/**/*`, so an unimported file under src still
    // compiles into build/ and lands in the npm tarball. Reachability alone
    // would not catch that.
    const present = BANNED_DIRS.filter((d) => existsSync(join(SRC, d)));
    expect(present, 'banned directories present under src/').toEqual([]);
  });

  it('lists no HTTP-server package in runtime dependencies', () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    const offenders = deps.filter((d) => HTTP_SERVER_PACKAGES.includes(d));
    expect(offenders, 'HTTP-server packages in runtime dependencies').toEqual([]);
  });

  it('pins the runtime dependency set', () => {
    // Stronger than the denylist above: a server dependency this file has
    // never heard of also fails, and has to be argued for here.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([...EXPECTED_RUNTIME_DEPS].sort());
  });

  it('carries no module that no entry point reaches', () => {
    const reachable = importGraph(ENTRY_POINTS);
    const orphans = allSourceFiles(SRC)
      .filter((f) => !reachable.has(f))
      .map(rel)
      .filter((f) => !INERT_BY_DECISION.includes(f))
      .sort();
    expect(orphans, 'modules compiled into the tarball that nothing reaches').toEqual([]);
  });
});
