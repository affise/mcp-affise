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
const ALLOWED_NEW_TOOLS = new Set<string>([
  // Phase 3: the two v3.0 analytics tools the 2.1.0 surface never had.
  'affise_stats_compare',
  'affise_affiliate_analysis',
]);

/**
 * Prompt-level fields that may appear on a prompt the golden does not have.
 *
 * `title` is emitted by McpServer.registerPrompt from its config object. The
 * 2.1.0 surface was a hand-written `prompts` array behind
 * `setRequestHandler(ListPromptsRequestSchema)`, which had nowhere to put one.
 */
const ALLOWED_ADDED_PROMPT_FIELDS = new Set(['title']);

/**
 * Argument-level fields whose value may differ from the golden.
 *
 * Only `description`, and it covers disappearing as well as changing: the
 * v3.0 argsSchemas reword most of these and leave `.describe()` off some
 * arguments entirely, so the SDK emits no `description` key for them.
 * `name` and `required` stay strict — those are the contract.
 */
const ALLOWED_CHANGED_ARG_FIELDS = new Set(['description']);

/**
 * Arguments added to an existing prompt since the baseline, per prompt.
 *
 * v3.0's `analyze_stats` argsSchema exposes the full `/stats/custom` filter
 * surface; 2.1.0 listed a 17-argument subset. Like ALLOWED_NEW_TOOLS this is
 * a requirement as well as a permission — an argument named here that the
 * server stops serving fails the gate, so the expansion cannot be reverted
 * silently.
 */
const ALLOWED_NEW_PROMPT_ARGS: Record<string, string[]> = {
  analyze_stats: [
    'advertiser_manager_id', 'affiliate', 'affiliate_manager_id', 'city',
    'os', 'os_version', 'browser', 'browser_version', 'device', 'device_model',
    'conn_type', 'isp', 'landing', 'prelanding', 'smart_id',
    'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
    'goal', 'trafficback_reason', 'conversionTypes', 'nonzero',
    'page', 'orderType', 'order', 'locale',
  ],
};

/**
 * Capability keys that may differ on `initialize`.
 *
 * `prompts` joined `tools` in Phase 4: registerPrompt calls
 * registerCapabilities({prompts: {listChanged: true}}), where the hand-wired
 * setRequestHandler path left the declared `{}` untouched.
 */
const ALLOWED_CAPABILITY_CHANGES = new Set(['tools', 'prompts']);

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

describe('wire surface vs the 2.1.0 baseline', () => {
  it('has a built server to check', () => {
    // Previously `describe.skipIf(!existsSync(ENTRY))`, which meant `npm test`
    // on a fresh clone reported green while checking nothing at all. The gate
    // reads build/index.js, not source, so a stale or missing build silently
    // validates the wrong thing.
    expect(existsSync(ENTRY), `no build at ${ENTRY} — run \`npm run build\` first`).toBe(true);
  });

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

    // ALLOWED_NEW_TOOLS is a requirement, not just a permission. Without this,
    // deleting a tool added since the baseline leaves the whole suite green:
    // it is absent from the golden, so `removed` stays empty, and absent from
    // the live list, so `added` stays empty. Verified by mutation — Phase 3's
    // entire deliverable could be reverted silently.
    const missing = [...ALLOWED_NEW_TOOLS].filter((n) => !liveTools.has(n));
    expect(missing, 'tools declared in ALLOWED_NEW_TOOLS but not served').toEqual([]);

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

    // Prompts are compared by name in both directions; neither the prompt
    // order nor the argument order is part of the contract.
    const goldenPrompts = new Map<string, any>(golden.prompts.map((p: any) => [p.name, p]));
    const livePrompts = new Map<string, any>(captured[2].result.prompts.map((p: any) => [p.name, p]));

    expect(
      [...goldenPrompts.keys()].filter((n) => !livePrompts.has(n)),
      'prompts disappeared from the published surface',
    ).toEqual([]);
    expect(
      [...livePrompts.keys()].filter((n) => !goldenPrompts.has(n)),
      'undeclared new prompts',
    ).toEqual([]);

    const promptViolations: string[] = [];
    for (const [name, goldenPrompt] of goldenPrompts) {
      const live = livePrompts.get(name);

      for (const field of new Set([...Object.keys(goldenPrompt), ...Object.keys(live)])) {
        if (field === 'arguments') continue;
        if (!(field in goldenPrompt)) {
          if (!ALLOWED_ADDED_PROMPT_FIELDS.has(field)) {
            promptViolations.push(`${name}: field '${field}' appeared`);
          }
        } else if (!(field in live)) {
          promptViolations.push(`${name}: field '${field}' disappeared`);
        } else if (!same(goldenPrompt[field], live[field])) {
          promptViolations.push(`${name}: field '${field}' changed`);
        }
      }

      const goldenArgs = new Map<string, any>((goldenPrompt.arguments ?? []).map((a: any) => [a.name, a]));
      const liveArgs = new Map<string, any>((live.arguments ?? []).map((a: any) => [a.name, a]));
      const declaredNew = new Set(ALLOWED_NEW_PROMPT_ARGS[name] ?? []);

      for (const argName of goldenArgs.keys()) {
        if (!liveArgs.has(argName)) promptViolations.push(`${name}: argument '${argName}' disappeared`);
      }
      for (const argName of liveArgs.keys()) {
        if (!goldenArgs.has(argName) && !declaredNew.has(argName)) {
          promptViolations.push(`${name}: undeclared new argument '${argName}'`);
        }
      }
      for (const argName of declaredNew) {
        if (!liveArgs.has(argName)) {
          promptViolations.push(`${name}: argument '${argName}' declared in ALLOWED_NEW_PROMPT_ARGS but not served`);
        }
      }

      for (const [argName, goldenArg] of goldenArgs) {
        const liveArg = liveArgs.get(argName);
        if (!liveArg) continue;
        for (const field of new Set([...Object.keys(goldenArg), ...Object.keys(liveArg)])) {
          if (ALLOWED_CHANGED_ARG_FIELDS.has(field)) continue;
          if (!same(goldenArg[field], liveArg[field])) {
            promptViolations.push(`${name}.${argName}: '${field}' changed`);
          }
        }
      }
    }
    expect(promptViolations, 'unexpected prompt-surface changes').toEqual([]);

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
