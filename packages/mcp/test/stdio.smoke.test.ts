import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { McpTestClient } from './utils/mcpTestClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('@browser-echo/mcp stdio transport (smoke)', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    const cli = join(__dirname, '..', 'bin', 'cli.mjs');
    client = new McpTestClient({ cliEntryPoint: cli, env: { BROWSER_ECHO_INGEST_PORT: '0' } });
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
    // Discover the actual ingest endpoint (ephemeral port in stdio mode)
    const candidates = [ join(process.cwd(), '.browser-echo-mcp.json'), join(tmpdir(), 'browser-echo-mcp.json') ];
    // wait up to 2s for cwd discovery to appear to avoid race
    const start = Date.now();
    while (!existsSync(candidates[0]) && (Date.now() - start) < 2000) {
      await new Promise(r => setTimeout(r, 50));
    }
    let base = '';
    let route = '/__client-logs';
    for (const p of candidates) {
      try {
        if (!existsSync(p)) continue;
        const raw = readFileSync(p, 'utf-8');
        const data = JSON.parse(raw);
        const u = String(data?.url || '').replace(/\/$/, '');
        const r = data?.routeLogs ? String(data.routeLogs) : route;
        // prefer stdio-scoped discovery (cwd) over tmp http discovery
        if (p.endsWith('.browser-echo-mcp.json') || !base) {
          base = u; route = r;
        }
        if (base) break;
      } catch {}
    }
    expect(base).toBeTruthy();

    // Post a log entry to the ingest endpoint that stdio server exposes
    const payload = { sessionId: 'deadbeef', entries: [{ level: 'error', text: 'stdio smoke' }] };
    const res = await fetch(`${base}${route}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    expect(res.status).toBe(204);
    // verify appears in diagnostics first
    const diag = await fetch(`${base}${route}`);
    const diagText = await diag.text();
    expect(diagText).toContain('stdio smoke');

    // poll get_logs briefly to avoid flakiness
    let text = '';
    for (let i = 0; i < 5; i++) {
      const got = await client.callTool('get_logs', { session: 'deadbeef', level: ['error'], includeStack: false, limit: 50 });
      text = String(got?.content?.[0]?.text || '');
      if (text.includes('stdio smoke')) break;
      await new Promise(r => setTimeout(r, 25));
    }
    expect(text).toContain('stdio smoke');
  });

  it('clears logs via clear_logs', async () => {
    const result = await client.callTool('clear_logs', { scope: 'all' });
    const msg = JSON.stringify(result);
    expect(msg).toContain('cleared');
  });
});


