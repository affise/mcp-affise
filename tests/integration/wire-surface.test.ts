/**
 * Wire-surface regression gate.
 *
 * `tests/golden/v2.1.0-baseline.json` records what the published 2.1.0 server
 * answered to `initialize` / `tools/list` / `prompts/list`. Until now nothing
 * read it: three separate verification rounds re-derived the diff by hand, and
 * a regression between rounds would have been invisible.
 *
 * This spawns the built server, captures the same three payloads, and fails on
 * any difference that is not on the allowlists below. The allowlists are the
 * point: each entry is a change somebody consciously accepted, so a new one has
 * to be argued for in review rather than noticed by luck.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ENTRY = resolve(__dirname, '../../build/index.js');
const GOLDEN = resolve(__dirname, '../golden/v2.1.0-baseline.json');

/**
 * Fields that may appear on a tool the golden does not have them on.
 *
 * All four arrived with the v3.0 handler layout: `title` and `_meta` are
 * authored in the schema files, `outputSchema` is declared per tool, and
 * `execution` is emitted by the SDK's McpServer.registerTool.
 */
const ALLOWED_ADDED_FIELDS = new Set(['title', '_meta', 'outputSchema', 'execution']);

/**
 * Fields whose value may differ from the golden.
 *
 * `annotations` gained destructiveHint/idempotentHint; `description` carries
 * v3.0's tightened texts; `inputSchema` is the same schema re-encoded by zod.
 */
const ALLOWED_CHANGED_FIELDS = new Set(['annotations', 'description', 'inputSchema']);

/** Tools added since the baseline. Phase 3 adds two; update deliberately. */
const ALLOWED_NEW_TOOLS = new Set<string>([]);

/** Capability keys that may differ on `initialize`. */
const ALLOWED_CAPABILITY_CHANGES = new Set(['tools']);

const rpc = (id: number | null, method: string, params?: unknown) =>
  JSON.stringify(params === undefined
    ? (id === null ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', id, method })
    : { jsonrpc: '2.0', id, method, params });

async function capture(): Promise<Record<number, any>> {
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
      AFFISE_BASE_URL: 'https://api-example.affise.com',
      AFFISE_API_KEY: 't1234567890abcdef',
      NODE_ENV: 'development',
    },
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
        /* stdout purity is asserted by its own test */
      }
    }
  });

  child.stdin.write(
    rpc(0, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'wire-surface-test', version: '1.0' },
    }) + '\n',
  );
  child.stdin.write(rpc(null, 'notifications/initialized') + '\n');
  child.stdin.write(rpc(1, 'tools/list') + '\n');
  child.stdin.write(rpc(2, 'prompts/list') + '\n');

  await new Promise<void>((done) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if ((byId[0] && byId[1] && byId[2]) || Date.now() - started > 20_000) {
        clearInterval(poll);
        done();
      }
    }, 100);
  });

  child.kill();
  return byId;
}

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as any)[k])]))
      : v;

const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

describe.skipIf(!existsSync(ENTRY))('wire surface vs the 2.1.0 baseline', () => {
  it('changes only in ways the allowlists permit', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const captured = await capture();

    expect(captured[1], 'tools/list returned nothing').toBeDefined();
    expect(captured[2], 'prompts/list returned nothing').toBeDefined();

    const goldenTools = new Map<string, any>(golden.tools.map((t: any) => [t.name, t]));
    const liveTools = new Map<string, any>(captured[1].result.tools.map((t: any) => [t.name, t]));

    const removed = [...goldenTools.keys()].filter((n) => !liveTools.has(n));
    expect(removed, 'tools disappeared from the published surface').toEqual([]);

    const added = [...liveTools.keys()].filter((n) => !goldenTools.has(n));
    expect(added.filter((n) => !ALLOWED_NEW_TOOLS.has(n)), 'undeclared new tools').toEqual([]);

    const violations: string[] = [];
    for (const [name, goldenTool] of goldenTools) {
      const live = liveTools.get(name);
      for (const field of new Set([...Object.keys(goldenTool), ...Object.keys(live)])) {
        if (!(field in goldenTool)) {
          if (!ALLOWED_ADDED_FIELDS.has(field)) violations.push(`${name}: field '${field}' appeared`);
        } else if (!(field in live)) {
          violations.push(`${name}: field '${field}' disappeared`);
        } else if (!same(goldenTool[field], live[field]) && !ALLOWED_CHANGED_FIELDS.has(field)) {
          violations.push(`${name}: field '${field}' changed`);
        }
      }
    }
    expect(violations, 'unexpected wire changes').toEqual([]);
  }, 40_000);

  it('keeps every tool titled and annotated read-only', async () => {
    const captured = await capture();
    for (const tool of captured[1].result.tools) {
      expect(tool.title, `${tool.name} has no title`).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, `${tool.name} is not marked read-only`).toBe(true);
      expect(tool.annotations?.destructiveHint, `${tool.name} lacks destructiveHint`).toBe(false);
      expect(tool.annotations?.idempotentHint, `${tool.name} lacks idempotentHint`).toBe(true);
      expect(tool.annotations?.openWorldHint, `${tool.name} lacks openWorldHint`).toBe(true);
    }
  }, 40_000);

  it('does not regrow a widget surface', async () => {
    const captured = await capture();
    const payload = JSON.stringify(captured[1]);
    expect(payload).not.toContain('resourceUri');
    expect(payload).not.toContain('ui://');
  }, 40_000);

  it('leaves prompts and negotiated capabilities where they were', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const captured = await capture();

    // The golden was captured with prompts sorted by name; the live server
    // returns them in registration order. Order is not part of the contract.
    const byName = (list: any[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
    expect(
      same(byName(captured[2].result.prompts), byName(golden.prompts)),
      'prompt list changed',
    ).toBe(true);

    // The golden stores the initialize *result*, not the enclosing JSON-RPC
    // envelope. Tolerate either shape so a re-capture that keeps the envelope
    // does not silently skip this assertion.
    const goldenInit = golden.initialize.result ?? golden.initialize;
    expect(captured[0].result.protocolVersion).toBe(goldenInit.protocolVersion);

    const goldenCaps = goldenInit.capabilities ?? {};
    const liveCaps = captured[0].result.capabilities ?? {};
    const changed = [...new Set([...Object.keys(goldenCaps), ...Object.keys(liveCaps)])]
      .filter((k) => !same(goldenCaps[k], liveCaps[k]))
      .filter((k) => !ALLOWED_CAPABILITY_CHANGES.has(k));
    expect(changed, 'undeclared capability changes').toEqual([]);
  }, 40_000);
});
