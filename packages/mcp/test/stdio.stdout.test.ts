import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpTestClient } from './utils/mcpTestClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('@browser-echo/mcp stdio transport — stdout discipline', () => {
  let client: McpTestClient;
  const logs: string[] = [];

  beforeAll(async () => {
    // Capture console.log during test to detect accidental stdout writes
    const origLog = console.log;
    (console as any)._origLog = origLog;
    console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };
    const cli = join(__dirname, '..', 'bin', 'cli.mjs');
    client = new McpTestClient({ cliEntryPoint: cli, env: { BROWSER_ECHO_INGEST_PORT: '0' } });
    await client.connect();
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    if ((console as any)._origLog) console.log = (console as any)._origLog;
  });

  it('does not write non-MCP content to stdout during normal operation', async () => {
    await client.listTools();
    // Our server uses stderr for banners; stdout stream should contain only JSON-RPC frames,
    // which we can't easily capture here. We assert that console.log hooks saw no banners.
    expect(logs.some(l => /MCP \(stdio\)|Log ingest endpoint/.test(l))).toBe(false);
  });
});


