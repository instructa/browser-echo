import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { McpTestClient } from './utils/mcpTestClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('@browser-echo/mcp stdio transport — multiple editors', () => {
  let c1: McpTestClient;
  let c2: McpTestClient;
  let c1Dir: string;
  let c2Dir: string;

  beforeAll(async () => {
    const cli = join(__dirname, '..', 'bin', 'cli.mjs');
    // Simulate two editors with separate working directories so discovery files don't collide
    c1Dir = mkdtempSync(join(tmpdir(), 'be-multi-a-'));
    c2Dir = mkdtempSync(join(tmpdir(), 'be-multi-b-'));
    c1 = new McpTestClient({ cliEntryPoint: cli, env: { BROWSER_ECHO_INGEST_PORT: '0' }, cwd: c1Dir });
    c2 = new McpTestClient({ cliEntryPoint: cli, env: { BROWSER_ECHO_INGEST_PORT: '0' }, cwd: c2Dir });
    await c1.connect();
    await c2.connect();
  }, 30_000);

  afterAll(async () => {
    await c1?.close();
    await c2?.close();
  });

  it('starts two stdio servers with different ingest ports (no conflict)', async () => {
    const p1 = join(c1Dir, '.browser-echo-mcp.json');
    const p2 = join(c2Dir, '.browser-echo-mcp.json');
    // wait briefly
    const start = Date.now();
    while ((!existsSync(p1) || !existsSync(p2)) && (Date.now() - start) < 2000) {
      await new Promise(r => setTimeout(r, 50));
    }
    const base1 = existsSync(p1) ? String(JSON.parse(readFileSync(p1, 'utf-8'))?.url || '').replace(/\/$/, '') : '';
    const base2 = existsSync(p2) ? String(JSON.parse(readFileSync(p2, 'utf-8'))?.url || '').replace(/\/$/, '') : '';
    expect(base1).toBeTruthy();
    expect(base2).toBeTruthy();
    expect(base1).not.toBe(base2);
  });

  it('logs sent to one ingest do not affect the other session buffer', async () => {
    // Read each server's own discovery
    const p1 = join(c1Dir, '.browser-echo-mcp.json');
    const p2 = join(c2Dir, '.browser-echo-mcp.json');
    const waitStart = Date.now();
    while ((!existsSync(p1) || !existsSync(p2)) && (Date.now() - waitStart) < 2000) {
      await new Promise(r => setTimeout(r, 50));
    }
    const d1 = existsSync(p1) ? JSON.parse(readFileSync(p1, 'utf-8')) : {};
    const d2 = existsSync(p2) ? JSON.parse(readFileSync(p2, 'utf-8')) : {};
    const base1 = String(d1?.url || '').replace(/\/$/, '');
    const base2 = String(d2?.url || '').replace(/\/$/, '');
    const route1 = d1?.route ? String(d1.route) : '/__client-logs';
    const route2 = d2?.route ? String(d2.route) : '/__client-logs';
    expect(base1).toBeTruthy();
    expect(base2).toBeTruthy();

    // Send two distinct sessions to their respective servers
    const s1 = 'ed1torA1';
    const s2 = 'ed1torB2';
    await fetch(`${base1}${route1}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: s1, entries: [{ level: 'info', text: 'multi A' }] }) });
    await fetch(`${base2}${route2}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: s2, entries: [{ level: 'info', text: 'multi B' }] }) });

    // Poll a few times for eventual consistency
    let aText = '', bText = '';
    for (let i = 0; i < 8; i++) {
      const a = await c1.callTool('get_logs', { session: s1, level: ['info','error','warn','log','debug'], includeStack: false, limit: 50 });
      const b = await c2.callTool('get_logs', { session: s2, level: ['info','error','warn','log','debug'], includeStack: false, limit: 50 });
      aText = String(a?.content?.[0]?.text || '');
      bText = String(b?.content?.[0]?.text || '');
      if (aText.includes('multi A') && bText.includes('multi B')) break;
      await new Promise(r => setTimeout(r, 30));
    }
    expect(aText).toContain('multi A');
    expect(bText).toContain('multi B');
  });
});


