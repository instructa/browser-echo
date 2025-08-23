import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMcpServer } from '../src/index';

const HOST = '127.0.0.1';
const PORT = 5183;
const BASE = `http://${HOST}:${PORT}`;

describe('E2E: Next route → MCP ingest', () => {
  const oldEnv = { ...process.env } as any;
  let POST: (req: any) => Promise<any>;
  let oldCwd: string;
  let workDir: string;
  beforeAll(async () => {
    await startMcpServer({ name: 'tests', version: 'test', host: HOST, port: PORT, endpoint: '/mcp', logsRoute: '/__client-logs' });
    // Use isolated cwd per suite and write project json so Next route forwards to our test server
    oldCwd = process.cwd();
    workDir = mkdtempSync(join(tmpdir(), 'be-next-e2e-'));
    process.chdir(workDir);
    const disc = join(workDir, '.browser-echo-mcp.json');
    writeFileSync(disc, JSON.stringify({ url: BASE, route: '/__client-logs', timestamp: Date.now() }));
    // Import after writing json so the route reads the configured MCP URL
    const mod: any = await import('../../next/src/route');
    POST = mod.POST;
  }, 30_000);

  afterAll(async () => {
    process.env = oldEnv;
    try { rmSync(join(workDir, '.browser-echo-mcp.json')); } catch {}
    try { process.chdir(oldCwd); } catch {}
  });

  it('forwards an error log to MCP', async () => {
    const req: any = { json: async () => ({ sessionId: 'n3xte2e', entries: [{ level: 'error', text: 'next e2e err' }] }) };
    const res: any = await POST(req as any);
    expect((res as any).status).toBe(204);

    await new Promise((r) => setTimeout(r, 200));
    const diag = await fetch(`${BASE}/__client-logs`);
    expect(diag.status).toBe(200);
    const body = await diag.text();
    expect(body).toContain('next e2e err');
  });

  it('includes warn/info as well', async () => {
    const req: any = { json: async () => ({ sessionId: 'n3xtwi', entries: [
      { level: 'warn', text: 'next e2e warn' },
      { level: 'info', text: 'next e2e info' }
    ] }) };
    const res: any = await POST(req as any);
    expect((res as any).status).toBe(204);

    await new Promise((r) => setTimeout(r, 200));
    const diag = await fetch(`${BASE}/__client-logs`);
    const body = await diag.text();
    expect(body).toContain('next e2e warn');
    expect(body).toContain('next e2e info');
  });
});


