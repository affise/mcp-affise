/**
 * The unconfigured window.
 *
 * A DXT user installs the extension and enters their API key afterwards, so
 * there is a real window in which this server runs with no credentials. Every
 * other wire test spawns a *configured* server, which is how two separate
 * defects lived here undetected:
 *
 *  - the server advertised `prompts` and `resources` capabilities, then
 *    answered `prompts/list` and `resources/list` with -32601
 *  - the instructions block — served in full, unconditionally — told the
 *    client to load `skill://affise/*`, against a resource surface that did
 *    not answer
 *
 * The rule this pins is one line long: **advertise exactly what you serve.**
 * A capability declared and not served is a promise the client acts on.
 *
 * The spawn below is deliberately hostile to ambient configuration: a fresh
 * temp cwd (so `dotenv.config()` finds no .env to load), and an environment
 * stripped to PATH with HOME pointed at nothing. Run this from the repo root
 * with a populated .env and it silently tests the configured path instead.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const ENTRY = resolve(__dirname, '../../build/index.js');

const REQUIRED_SKILL_RESOURCES = [
  'skill://affise/affiliate-manager',
  'skill://affise/advertiser-manager',
  'skill://affise/affiliate-publisher',
  'skill://affise/business-owner',
];

const rpc = (id: number | null, method: string, params?: unknown) =>
  JSON.stringify(
    params === undefined
      ? id === null
        ? { jsonrpc: '2.0', method }
        : { jsonrpc: '2.0', id, method }
      : { jsonrpc: '2.0', id, method, params },
  );

async function captureUnconfigured(): Promise<Record<number, any>> {
  const cleanCwd = mkdtempSync(join(tmpdir(), 'affise-unconfigured-'));
  const child = spawn(process.execPath, [ENTRY], {
    cwd: cleanCwd,
    // Not `...process.env` — the point is to have no credentials at all, and
    // AFFISE_BASE_URL/AFFISE_API_KEY in the developer's shell would defeat it.
    env: { PATH: process.env.PATH ?? '', HOME: join(cleanCwd, 'no-home') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const byId: Record<number, any> = {};
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (typeof msg.id === 'number') byId[msg.id] = msg;
      } catch {
        /* stdout purity has its own test */
      }
    }
  });

  child.stdin.write(
    rpc(0, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'unconfigured-surface-test', version: '1.0' },
    }) + '\n',
  );
  child.stdin.write(rpc(null, 'notifications/initialized') + '\n');
  child.stdin.write(rpc(1, 'tools/list') + '\n');
  child.stdin.write(rpc(2, 'prompts/list') + '\n');
  child.stdin.write(rpc(3, 'resources/list') + '\n');
  child.stdin.write(rpc(4, 'resources/read', { uri: REQUIRED_SKILL_RESOURCES[0] }) + '\n');

  // A -32601 still arrives as a response with the matching id, so a lost
  // surface fails an assertion rather than hanging to the deadline.
  const needed = [0, 1, 2, 3, 4];
  await new Promise<void>((done) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (needed.every((i) => byId[i]) || Date.now() - started > 15_000) {
        clearInterval(poll);
        done();
      }
    }, 100);
  });

  child.kill();
  return byId;
}

describe('unconfigured server surface', () => {
  let captured: Record<number, any>;

  beforeAll(async () => {
    expect(existsSync(ENTRY), `no build at ${ENTRY} — run \`npm run build\` first`).toBe(true);
    captured = await captureUnconfigured();
  }, 30_000);

  it('really is unconfigured', () => {
    // If credentials leaked in, tools/list returns the full inventory and
    // every assertion below would be testing the wrong branch.
    //
    // The `affise_status` here is NOT the catalogue tool of that name — that
    // one was dropped. It is the setup-instructions tool the unconfigured
    // fallback in src/index.ts registers, and it exists only on this branch.
    expect(captured[1]?.result?.tools?.length, 'expected the status-only fallback').toBe(1);
    expect(captured[1].result.tools[0].name).toBe('affise_status');
  });

  it('advertises no capability it does not serve', () => {
    const caps = captured[0].result.capabilities ?? {};
    for (const [name, id] of [['tools', 1], ['prompts', 2], ['resources', 3]] as const) {
      const declared = name in caps;
      const served = !captured[id]?.error;
      expect(
        declared,
        served
          ? `${name} is served but not advertised`
          : `${name} is advertised but ${name}/list answers ${captured[id]?.error?.code}`,
      ).toBe(served);
    }
  });

  it('does not advertise prompts, which need credentials to build', () => {
    expect(captured[0].result.capabilities).not.toHaveProperty('prompts');
    expect(captured[2]?.error?.code, 'prompts/list unexpectedly answered').toBe(-32601);
  });

  it('serves the role playbooks the instructions block points at', () => {
    // The instructions are returned in full whether or not credentials exist,
    // and they route the client to skill://affise/*. Serving that brief while
    // resources/list answers -32601 sends the client somewhere that is not there.
    expect(captured[0].result.instructions).toContain('skill://affise/');
    expect(captured[3]?.error, 'resources/list returned an error').toBeUndefined();

    const listed: string[] = (captured[3].result.resources ?? []).map((r: any) => r.uri);
    expect(listed.sort()).toEqual([...REQUIRED_SKILL_RESOURCES].sort());
  });

  it('resolves a playbook to real markdown before any key is entered', () => {
    const body = captured[4]?.result?.contents?.[0];
    expect(captured[4]?.error, 'resources/read failed').toBeUndefined();
    expect(body?.uri).toBe(REQUIRED_SKILL_RESOURCES[0]);
    expect(body?.mimeType).toBe('text/markdown');
    expect(body?.text?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
