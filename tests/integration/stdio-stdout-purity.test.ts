/**
 * Stdout purity smoke for the stdio transport.
 *
 * Claude Desktop reads JSON-RPC from stdout; ANY non-JSON line (a dotenv
 * banner, a stray console.log) corrupts the stream and the server never
 * connects. This spawns the built server, performs an initialize round-trip
 * and asserts every stdout line is valid JSON-RPC. Runs only when
 * build/index.js exists — CI builds before `npm test`.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ENTRY = resolve(__dirname, '../../build/index.js');

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'stdout-purity-test', version: '1.0' },
  },
});

describe.skipIf(!existsSync(ENTRY))('stdio transport — stdout purity', () => {
  it('emits only JSON-RPC on stdout during startup + initialize', async () => {
    const child = spawn('node', [ENTRY], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        AFFISE_BASE_URL: 'https://api.example.affise.com',
        AFFISE_API_KEY: 't1234567890abc',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    const gotResponse = new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(
        () => rejectPromise(new Error(`no initialize response; stdout so far: ${JSON.stringify(stdout)}`)),
        10000,
      );
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('\n')) {
          clearTimeout(timer);
          resolvePromise();
        }
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        rejectPromise(e);
      });
    });

    try {
      child.stdin.write(INITIALIZE + '\n');
      await gotResponse;
    } finally {
      child.kill();
    }

    const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
    }

    const response = JSON.parse(lines[0]);
    expect(response.id).toBe(0);
    expect(response.result?.serverInfo?.name).toBe('affise-mcp-server');
  }, 15000);
});
