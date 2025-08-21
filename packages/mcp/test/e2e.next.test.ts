import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startMcpServer } from '../src/index';

const HOST = '127.0.0.1';
const PORT = 5183;
const BASE = `http://${HOST}:${PORT}`;

describe('E2E: Next route → MCP ingest', () => {
  const oldEnv = { ...process.env } as any;
  let POST: (req: any) => Promise<any>;
  beforeAll(async () => {
    await startMcpServer({ name: 'tests', version: 'test', host: HOST, port: PORT, endpoint: '/mcp', logsRoute: '/__client-logs' });
    process.env.BROWSER_ECHO_MCP_URL = BASE; // ensure route forwards
    // Import after setting env so the route reads the configured MCP URL
    const mod: any = await import('../../next/src/route');
    POST = mod.POST;
  }, 30_000);

  afterAll(async () => {
    process.env = oldEnv;
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


