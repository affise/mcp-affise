/**
 * Guards the loadConfig() -> EnhancedToolHandler.executeTool() seam.
 *
 * Every other test injects a plain-object config, so the whole suite stayed
 * green while the stdio transport was returning "apiKey not provided" for every
 * credential-using tool. The real object on that path is a SecureConfigWrapper
 * whose baseUrl/apiKey are prototype getters, and `{ ...wrapper }` copies own
 * enumerable properties only.
 */

import { describe, it, expect } from 'vitest';
import { normalizeBaseUrl } from '../../src/utils/url.js';

/** Same shape as the SecureConfigWrapper returned by loadConfig(). */
class AccessorBackedConfig {
  constructor(private inner: { baseUrl: string; apiKey: string }) {}
  get baseUrl(): string {
    return this.inner.baseUrl;
  }
  get apiKey(): string {
    return this.inner.apiKey;
  }
}

/** The normalization performed in EnhancedToolHandler.executeTool(). */
function resolveConfig(rawConfig: { baseUrl: string; apiKey: string } | undefined) {
  return rawConfig
    ? { ...rawConfig, baseUrl: normalizeBaseUrl(rawConfig.baseUrl), apiKey: rawConfig.apiKey }
    : rawConfig;
}

describe('config resolution across the accessor seam', () => {
  it('keeps apiKey when the config exposes it as a prototype getter', () => {
    const wrapper = new AccessorBackedConfig({
      baseUrl: 'https://api-company.affise.com',
      apiKey: 'k1234567890abcdef',
    });

    const resolved = resolveConfig(wrapper);

    expect(resolved?.apiKey).toBe('k1234567890abcdef');
    expect(resolved?.baseUrl).toBe('https://api-company.affise.com');
  });

  it('demonstrates why the explicit re-read is required', () => {
    const wrapper = new AccessorBackedConfig({
      baseUrl: 'https://api-company.affise.com',
      apiKey: 'k1234567890abcdef',
    });

    expect(Object.keys(wrapper)).not.toContain('apiKey');
    expect({ ...wrapper }.apiKey).toBeUndefined();
  });

  it('still normalizes a trailing slash', () => {
    const wrapper = new AccessorBackedConfig({
      baseUrl: 'https://api-company.affise.com/',
      apiKey: 'k1234567890abcdef',
    });

    expect(resolveConfig(wrapper)?.baseUrl).toBe('https://api-company.affise.com');
  });

  it('preserves extra fields on a plain session object', () => {
    const session = {
      baseUrl: 'https://api-company.affise.com/',
      apiKey: 'k1234567890abcdef',
      sessionId: 'sess-123',
    };

    const resolved = resolveConfig(session) as typeof session;

    expect(resolved.sessionId).toBe('sess-123');
    expect(resolved.apiKey).toBe('k1234567890abcdef');
    expect(resolved.baseUrl).toBe('https://api-company.affise.com');
  });
});
