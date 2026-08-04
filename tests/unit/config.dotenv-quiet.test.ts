/**
 * dotenv >= 17 prints an injection banner via console.log by default. Stdout
 * is reserved for JSON-RPC on the stdio transport, so config loading must
 * stay silent. The guard sets DOTENV_CONFIG_QUIET before dotenv.config() —
 * a no-op on dotenv 16, banner suppression on 17. These tests pin the guard
 * so the dotenv major bump cannot silently reintroduce stdout noise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_KEY = 'DOTENV_CONFIG_QUIET';
let savedValue: string | undefined;

beforeEach(() => {
  savedValue = process.env[ENV_KEY];
  vi.resetModules();
});

afterEach(() => {
  if (savedValue === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = savedValue;
  }
  vi.restoreAllMocks();
});

describe('config module — dotenv quiet guard', () => {
  it('sets DOTENV_CONFIG_QUIET=true when unset', async () => {
    delete process.env[ENV_KEY];

    await import('../../src/config.js');

    expect(process.env[ENV_KEY]).toBe('true');
  });

  it('respects an explicitly pre-set value', async () => {
    process.env[ENV_KEY] = 'false';

    await import('../../src/config.js');

    expect(process.env[ENV_KEY]).toBe('false');
  });

  it('writes nothing to stdout while loading', async () => {
    delete process.env[ENV_KEY];
    const stdoutWrite = vi.spyOn(process.stdout, 'write');
    const consoleLog = vi.spyOn(console, 'log');

    await import('../../src/config.js');

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });
});
