import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startMcpServer } from '../src/index';
import { createApp, createRouter, toNodeListener } from 'h3';
import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 5184;
const BASE = `http://${HOST}:${PORT}`;

// Minimal h3 event mock compatible with our handler
function makeEvent() { return {} as any; }

describe('E2E: Nuxt handler → MCP ingest', () => {
  const oldEnv = { ...process.env } as any;
  let handler: (e: any) => Promise<any>;
  beforeAll(async () => {
    await startMcpServer({ host: HOST, port: PORT, endpoint: '/mcp', logsRoute: '/__client-logs' });
    process.env.BROWSER_ECHO_MCP_URL = BASE;
    const mod: any = await import('../../nuxt/src/runtime/server/handler');
    handler = mod.default || mod;
  }, 30_000);

  afterAll(async () => {
    process.env = oldEnv;
  });

  it('flushes an error entry to MCP', async () => {
    // Spin up a tiny H3 server that mounts the Nuxt handler and POST a payload
    const app = createApp();
    const router = createRouter();
    const route = '/__nuxt-e2e';
    router.post(route, handler as any);
    app.use(router);

    const server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? (address as any).port : 0;

    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'nuxte2e', entries: [{ level: 'error', text: 'nuxt e2e err' }] })
    });
    // h3 handler returns text body but we only care it didn't error and MCP forwarding occurred
    expect(res.status).toBe(204);

    server.close();

    await new Promise((r) => setTimeout(r, 200));
    const diag = await fetch(`${BASE}/__client-logs`);
    expect(diag.status).toBe(200);
    const body = await diag.text();
    expect(body).toContain('nuxt e2e err');
  });
});


