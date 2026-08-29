/**
 * The prompt argsSchemas deliberately declare list/object arguments as
 * `z.unknown().optional()` and coerce inside each callback, because Affise
 * clients have historically sent both `arg: 'x'` and `arg: ['x']` for the same
 * list argument. Tightening those to `z.array(z.string())` would read as a
 * cleanup and would reject every client on the scalar side.
 *
 * Nothing else pins that down: `prompts/list` reports only name/description/
 * required, so a schema tightened to `z.array(...)` would leave the wire gate
 * green and break clients at `prompts/get` time.
 *
 * These assertions reach the registered prompts through McpServer's private
 * `_registeredPrompts` on purpose. The public route — an in-memory client
 * calling `prompts/get` — cannot express the array shape at all: the SDK's
 * GetPromptRequestParamsSchema types `arguments` as
 * `z.record(z.string(), z.string())` and rejects an array value before any
 * argsSchema runs. That protocol-level constraint is the SDK's and predates
 * this port; the coercion layer underneath it is what these tests hold.
 */

import { describe, it, expect } from 'vitest';
import { McpServer } from '../../src/mcp-sdk.js';
import { setupPromptHandlers } from '../../src/handlers/prompts.js';

const CONFIG = { baseUrl: 'https://api-example.affise.com', apiKey: 't1234567890abcdef' };

function registeredPrompts() {
  const server = new McpServer(
    { name: 'test', version: '1.0.0' },
    { capabilities: { prompts: {} } },
  );
  setupPromptHandlers(server, CONFIG);
  return (server as unknown as { _registeredPrompts: Record<string, any> })._registeredPrompts;
}

describe('prompt argument coercion', () => {
  const prompts = registeredPrompts();

  it('registers exactly the six analysis prompts', () => {
    expect(Object.keys(prompts).sort()).toEqual([
      'analyze_conversions',
      'analyze_offers',
      'analyze_stats',
      'analyze_trafficback',
      'auto_analysis',
      'workflow_analysis',
    ]);
  });

  // The required argument of each prompt, so the probe below exercises the
  // list argument rather than tripping over a missing sibling.
  const REQUIRED_ARG: Record<string, Record<string, string>> = {
    workflow_analysis: {},
    analyze_offers: { offers_data: '[]' },
    analyze_trafficback: { trafficback_data: '[]' },
    analyze_conversions: { conversions_data: '[]' },
    analyze_stats: {},
    auto_analysis: {},
  };

  it.each([
    ['workflow_analysis', 'countries'],
    ['workflow_analysis', 'status'],
    ['workflow_analysis', 'focus_areas'],
    ['analyze_offers', 'focus_areas'],
    ['analyze_trafficback', 'focus_areas'],
    ['analyze_conversions', 'focus_areas'],
    ['analyze_stats', 'slice'],
    ['analyze_stats', 'fields'],
    ['auto_analysis', 'offer_countries'],
    ['auto_analysis', 'focus_areas'],
  ])('%s.%s accepts both a scalar and an array', (promptName, argName) => {
    // registerPrompt normalizes the raw shape into a Zod object, so this is
    // the exact schema `prompts/get` validates arguments against.
    const schema = prompts[promptName].argsSchema;
    const base = REQUIRED_ARG[promptName];
    expect(schema.safeParse({ ...base, [argName]: 'alpha' }).success).toBe(true);
    expect(schema.safeParse({ ...base, [argName]: ['alpha'] }).success).toBe(true);
    expect(schema.safeParse({ ...base }).success).toBe(true);
  });

  it('workflow_analysis produces the same prompt for a scalar and a one-element array', async () => {
    const cb = prompts.workflow_analysis.callback;
    const scalar = await cb({ search_query: 'finance', countries: 'US' }, {} as any);
    const array = await cb({ search_query: 'finance', countries: ['US'] }, {} as any);
    expect(JSON.stringify(array)).toBe(JSON.stringify(scalar));
    expect(scalar.messages[0].content.text).toContain('US');
  });

  it('analyze_offers produces the same prompt for a scalar and a one-element array', async () => {
    const cb = prompts.analyze_offers.callback;
    const offers_data = JSON.stringify([{ id: 1, title: 'Example offer' }]);
    const scalar = await cb({ offers_data, focus_areas: 'payouts' }, {} as any);
    const array = await cb({ offers_data, focus_areas: ['payouts'] }, {} as any);
    expect(JSON.stringify(array)).toBe(JSON.stringify(scalar));
    expect(scalar.messages[0].content.text).toContain('payouts');
  });

  it('keeps the required flags the wire surface advertises', () => {
    const required = (name: string) =>
      Object.entries(prompts[name].argsSchema.shape as Record<string, any>)
        .filter(([, schema]) => !schema.safeParse(undefined).success)
        .map(([argName]) => argName);

    expect(required('analyze_offers')).toEqual(['offers_data']);
    expect(required('analyze_trafficback')).toEqual(['trafficback_data']);
    expect(required('analyze_conversions')).toEqual(['conversions_data']);
    expect(required('analyze_stats')).toEqual([]);
    expect(required('workflow_analysis')).toEqual([]);
    expect(required('auto_analysis')).toEqual([]);
  });
});
