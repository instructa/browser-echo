import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpTestClient } from './utils/mcpTestClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('@browser-echo/mcp stdio transport (smoke)', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    const cli = join(__dirname, '..', 'bin', 'cli.mjs');
    client = new McpTestClient({ cliEntryPoint: cli });
    await client.connect();
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it('lists tools', async () => {
    const out = await client.listTools();
    // minimal shape validation
    expect(out?.tools?.length).toBeGreaterThan(0);
    const names = (out.tools || []).map((t: any) => t.name);
    expect(names).toContain('get_logs');
    expect(names).toContain('clear_logs');
  });

  it('ingests logs via HTTP ingest and retrieves via get_logs', async () => {
    // Post a log entry to the ingest endpoint that stdio server exposes
    const payload = { sessionId: 'deadbeef', entries: [{ level: 'error', text: 'stdio smoke' }] };
    const res = await fetch('http://127.0.0.1:5179/__client-logs', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    expect(res.status).toBe(204);

    const got = await client.callTool('get_logs', { session: 'deadbeef', level: ['error'], includeStack: false, limit: 10 });
    const text = String(got?.content?.[0]?.text || '');
    expect(text).toContain('stdio smoke');
  });

  it('clears logs via clear_logs', async () => {
    const result = await client.callTool('clear_logs', { scope: 'all' });
    const msg = JSON.stringify(result);
    expect(msg).toContain('cleared');
  });
});


