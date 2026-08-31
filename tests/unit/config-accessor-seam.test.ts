/**
 * Guards the loadConfig() -> EnhancedToolHandler.executeTool() -> handler seam.
 *
 * Every other test in the suite injects a plain-object config, so the whole
 * suite stayed green while the stdio transport returned "baseUrl or apiKey not
 * provided" for every credential-using tool. The real object on that path is a
 * SecureConfigWrapper whose baseUrl/apiKey are prototype getters, and
 * `{ ...wrapper }` copies own enumerable properties only.
 *
 * This file must drive the REAL EnhancedToolHandler. An earlier version of it
 * re-implemented the normalization expression locally and asserted against its
 * own copy, so deleting the fix from the production file left it green — it
 * could not fail. If you change how executeTool resolves the config, this test
 * has to be the thing that tells you.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Captures the config object each dispatched handler is handed. */
const seen: Array<{ baseUrl?: string; apiKey?: string; [k: string]: unknown } | null> = [];

vi.mock('../../src/handlers/tools/index.js', () => ({
  HANDLER_REGISTRY: {
    affise_offer_categories: async (_args: unknown, config: any) => {
      seen.push(config);
      return { status: 'success', message: 'ok', data: {}, timestamp: new Date().toISOString() };
    },
  },
}));

import { EnhancedToolHandler } from '../../src/handlers/enhanced-tools.js';

/** Same shape as the SecureConfigWrapper that loadConfig() returns. */
class AccessorBackedConfig {
  constructor(private inner: { baseUrl: string; apiKey: string }) {}
  get baseUrl(): string {
    return this.inner.baseUrl;
  }
  get apiKey(): string {
    return this.inner.apiKey;
  }
}

const CREDS = { baseUrl: 'https://api-company.affise.com', apiKey: 'k1234567890abcdef' };

describe('config resolution across the accessor seam', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('hands the handler a usable apiKey when the config exposes it as a getter', async () => {
    const handler = new EnhancedToolHandler(new AccessorBackedConfig(CREDS) as any);

    await handler.executeTool('affise_offer_categories', {});

    expect(seen).toHaveLength(1);
    expect(seen[0]?.apiKey).toBe(CREDS.apiKey);
    expect(seen[0]?.baseUrl).toBe(CREDS.baseUrl);
  });

  it('does the same for a per-request session that exposes getters', async () => {
    const handler = new EnhancedToolHandler(null);

    await handler.executeTool('affise_offer_categories', {}, new AccessorBackedConfig(CREDS) as any);

    expect(seen[0]?.apiKey).toBe(CREDS.apiKey);
  });

  it('normalizes a trailing slash without losing the key', async () => {
    const handler = new EnhancedToolHandler(
      new AccessorBackedConfig({ ...CREDS, baseUrl: `${CREDS.baseUrl}/` }) as any,
    );

    await handler.executeTool('affise_offer_categories', {});

    expect(seen[0]?.baseUrl).toBe(CREDS.baseUrl);
    expect(seen[0]?.apiKey).toBe(CREDS.apiKey);
  });

  it('preserves extra fields on a plain session object', async () => {
    const handler = new EnhancedToolHandler(null);

    await handler.executeTool('affise_offer_categories', {}, { ...CREDS, sessionId: 'sess-123' } as any);

    expect(seen[0]?.sessionId).toBe('sess-123');
    expect(seen[0]?.apiKey).toBe(CREDS.apiKey);
  });

  it('documents why the explicit re-read is required', () => {
    const wrapper = new AccessorBackedConfig(CREDS);

    expect(Object.keys(wrapper)).not.toContain('apiKey');
    expect({ ...wrapper }.apiKey).toBeUndefined();
  });
});
