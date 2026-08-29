/**
 * Behavioural test for `src/health/health-check.ts` — the `npm run health`
 * entry point.
 *
 * This file shipped completely broken for an entire release cycle: its
 * `require.main === module` CLI guard threw a `ReferenceError` in this ESM
 * package, so `node build/health/health-check.js` crashed on every
 * invocation and nobody noticed because nothing exercised it. The guard was
 * rewritten to compare `import.meta.url` against `pathToFileURL(argv[1])`,
 * which fixed the crash but introduced a quieter failure: `import.meta.url`
 * is realpath-resolved by Node's module loader, while `argv[1]` is the path
 * as invoked. Whenever that path crosses a symlink — macOS's
 * `/tmp -> /private/tmp`, a `current -> releases/<id>` deploy layout, an
 * `npm link`ed install — the two URLs disagree, the guard reads false, and
 * the process exits 0 with empty stdout: no crash, no JSON, a "healthy"-
 * looking exit code, having run nothing at all. That failure mode is worse
 * than the ReferenceError it replaced, because it reads as success.
 *
 * Both the plain unconfigured case and the symlink case are asserted here so
 * a regression in either direction goes red instead of shipping silently.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, existsSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const ENTRY = resolve(__dirname, '../../build/health/health-check.js');

function runHealthCheck(entry: string, extraArgs: string[] = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'affise-health-'));
  // No AFFISE_BASE_URL / AFFISE_API_KEY, and a cwd with no .env — the point
  // is an unconfigured server, same discipline as unconfigured-surface.test.ts.
  return spawnSync(process.execPath, [entry, ...extraArgs], {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: join(cwd, 'no-home') },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

describe('health-check entry point', () => {
  it('has a built entry point to check', () => {
    expect(existsSync(ENTRY), `no build at ${ENTRY} — run \`npm run build\` first`).toBe(true);
  });

  it('exits non-zero with a valid JSON body when unconfigured', () => {
    const result = runHealthCheck(ENTRY);

    expect(result.error, 'failed to spawn health-check.js').toBeUndefined();
    expect(result.status, `expected a failing exit code; stderr: ${result.stderr}`).not.toBe(0);
    expect(result.status).not.toBeNull();

    let parsed: any;
    expect(() => { parsed = JSON.parse(result.stdout); }, `stdout was not valid JSON: ${result.stdout}`).not.toThrow();

    expect(parsed.status).toBe('unhealthy');
    expect(parsed.checks.process).toBe(true);
    expect(parsed.checks.configuration).toBe(false);
    expect(parsed.checks.affiseApi).toBe(false);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('--simple suppresses the JSON body but keeps the real exit code', () => {
    const result = runHealthCheck(ENTRY, ['--simple']);

    expect(result.status).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  // Regression test for the symlink defect described above. Without
  // `realpathSync` on `argv[1]` in the production guard, this invocation
  // silently no-ops: exit 0, empty stdout, nothing checked.
  it('still runs the check when invoked through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'affise-health-symlink-'));
    const link = join(dir, 'health-check.js');
    symlinkSync(ENTRY, link);

    const result = runHealthCheck(link);

    expect(result.error, 'failed to spawn the symlinked entry point').toBeUndefined();
    expect(
      result.status,
      `symlinked invocation produced no result — the invokedDirectly guard likely regressed; stdout: ${JSON.stringify(result.stdout)}, stderr: ${result.stderr}`,
    ).not.toBe(0);

    let parsed: any;
    expect(() => { parsed = JSON.parse(result.stdout); }, `stdout was not valid JSON: ${result.stdout}`).not.toThrow();
    expect(parsed.status).toBe('unhealthy');
  });
});
