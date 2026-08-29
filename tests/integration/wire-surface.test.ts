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
 *
 * `resources` joined them in Phase 5 for the same mechanical reason:
 * registerResource calls registerCapabilities({resources: {listChanged: true}}),
 * so declaring `resources: {}` on the constructor is not what ends up on the
 * wire. The golden has no `resources` key at all — 2.1.0 answered
 * resources/list with -32601 — so this entry covers the key appearing, and
 * the skill-inventory tests below are what actually pin its contents.
 */
const ALLOWED_CAPABILITY_CHANGES = new Set(['tools', 'prompts', 'resources']);

/**
 * The `skill://affise/*` resources the package must serve.
 *
 * The golden records `resources: []`, which is *absence* (-32601), not an
 * empty listing — so unlike tools and prompts there is nothing to diff the
 * skill inventory against, and it would arrive unguarded by default. This
 * list is the guard, and like ALLOWED_NEW_TOOLS it is a **requirement** as
 * well as a permission: a URI named here that stops being listed, or stops
 * resolving through resources/read, fails the gate. Membership is checked in
 * both directions, so an undeclared skill appearing fails too.
 */
const REQUIRED_SKILL_RESOURCES = [
  'skill://affise/affiliate-manager',
  'skill://affise/advertiser-manager',
  'skill://affise/affiliate-publisher',
  'skill://affise/business-owner',
];

/** Request ids 10..13 carry one resources/read per REQUIRED_SKILL_RESOURCES entry. */
const SKILL_READ_ID_BASE = 10;

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
  child.stdin.write(rpc(3, 'resources/list') + '\n');
  REQUIRED_SKILL_RESOURCES.forEach((uri, i) => {
    child.stdin.write(rpc(SKILL_READ_ID_BASE + i, 'resources/read', { uri }) + '\n');
  });

  // resources/list answering -32601 still produces a response with id 3, so a
  // server that has lost the resource surface fails an assertion rather than
  // hanging until the poll's own deadline and reporting a timeout instead.
  const needed = [0, 1, 2, 3, ...REQUIRED_SKILL_RESOURCES.map((_, i) => SKILL_READ_ID_BASE + i)];

  await new Promise<void>((done) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (needed.every((i) => byId[i]) || Date.now() - started > 20_000) {
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

  it('never drops documentation a published prompt argument already had', async () => {
    // The v3.0 prompt layer leaves `.describe()` off 30 of auto_analysis's 42
    // arguments; 2.1.0 documented all of them. Porting verbatim would have
    // shipped a strictly worse surface — a model calling the prompt would see
    // `date_from` and `stats_fields` with no explanation. Argument descriptions
    // are on the changed-allowlist so wording can move, but losing one is not
    // a wording change.
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const captured = await capture();
    const live = new Map<string, any>(
      captured[2].result.prompts.map((p: any) => [p.name, p]),
    );

    const regressed: string[] = [];
    for (const goldenPrompt of golden.prompts) {
      const livePrompt = live.get(goldenPrompt.name);
      if (!livePrompt) continue;
      const liveArgs = new Map<string, any>(
        (livePrompt.arguments ?? []).map((a: any) => [a.name, a]),
      );
      for (const arg of goldenPrompt.arguments ?? []) {
        if (!arg.description) continue;
        const liveArg = liveArgs.get(arg.name);
        if (liveArg && !liveArg.description) {
          regressed.push(`${goldenPrompt.name}.${arg.name}`);
        }
      }
    }
    expect(regressed, 'prompt arguments that lost their description').toEqual([]);
  }, 40_000);

  it('does not regrow a widget surface', async () => {
    const captured = await capture();
    // Phase 5 opened the resource surface, which is exactly where a deferred
    // widget would reappear — a ui:// entry in resources/list rather than a
    // _meta.ui on a tool. Check both payloads, not just tools/list.
    const payload = JSON.stringify(captured[1]) + JSON.stringify(captured[3]);
    expect(payload).not.toContain('resourceUri');
    expect(payload).not.toContain('ui://');
  }, 40_000);

  it('serves exactly the declared skill resources', async () => {
    const captured = await capture();

    expect(captured[3]?.error, 'resources/list returned an error').toBeUndefined();
    const listed: string[] = (captured[3].result.resources ?? []).map((r: any) => r.uri);

    expect(
      REQUIRED_SKILL_RESOURCES.filter((u) => !listed.includes(u)),
      'declared skill resources missing from resources/list',
    ).toEqual([]);
    expect(
      listed.filter((u) => !REQUIRED_SKILL_RESOURCES.includes(u)),
      'undeclared resources appeared',
    ).toEqual([]);
  }, 40_000);

  it('resolves every advertised skill resource to non-empty markdown', async () => {
    const captured = await capture();

    // The previous test pins the advertised set equal to REQUIRED_SKILL_RESOURCES,
    // so reading the required set reads everything resources/list advertises.
    const broken: string[] = [];
    REQUIRED_SKILL_RESOURCES.forEach((uri, i) => {
      const res = captured[SKILL_READ_ID_BASE + i];
      if (!res || res.error) {
        broken.push(`${uri}: read failed (${res?.error?.message ?? 'no response'})`);
        return;
      }
      const body = res.result?.contents?.[0];
      if (body?.uri !== uri) broken.push(`${uri}: read returned uri '${body?.uri}'`);
      if (body?.mimeType !== 'text/markdown') broken.push(`${uri}: mimeType '${body?.mimeType}'`);
      if (!body?.text?.trim()) broken.push(`${uri}: empty body`);
    });
    expect(broken, 'skill resources that do not resolve').toEqual([]);
  }, 40_000);

  it('returns a non-empty instructions block on initialize', async () => {
    // Nothing asserted on `instructions` before Phase 5, so a regression that
    // emptied it — a bad import, a stripped constant — would have shipped
    // silently. The golden has no instructions field to diff against: 2.1.0
    // omitted it entirely, so this is a floor, not a comparison.
    const captured = await capture();
    const instructions = captured[0].result.instructions;
    expect(typeof instructions, 'initialize returned no instructions field').toBe('string');
    expect(instructions.trim().length, 'instructions is empty').toBeGreaterThan(0);
    // The block's whole job is routing the caller to a tool or a playbook.
    expect(instructions).toContain('skill://affise/');
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
        const liveArg = liveArgs.get(argName);
        if (!liveArg) {
          promptViolations.push(`${name}: argument '${argName}' declared in ALLOWED_NEW_PROMPT_ARGS but not served`);
          continue;
        }
        // The allowlist permits an argument to exist; it does not permit that
        // argument to become mandatory. A new arg turning required is a
        // client-breaking wire change — every prompts/get call that omitted it
        // starts failing — and without this the gate stayed green for it.
        if (liveArg.required) {
          promptViolations.push(`${name}: newly-added argument '${argName}' became required`);
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
