import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMcpServer } from '../src/index';
import browserEcho from '../../vite/src/index';

const HOST = '127.0.0.1';
const PORT = 5182; // separate port from other smoke tests
const BASE = `http://${HOST}:${PORT}`;

function makeServerMock() {
  const logs: any[] = [];
  const logger = {
    info: (m: string) => logs.push(['info', m]),
    warn: (m: string) => logs.push(['warn', m]),
    error: (m: string) => logs.push(['error', m])
  };
  const handlers: Array<[string, Function]> = [];
  const server: any = {
    config: { logger },
    middlewares: { use: (route: string, fn: Function) => handlers.push([route, fn]) }
  };
  return { server, logs, handlers };
}

async function httpGet(url: string) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}

describe('E2E: Vite → MCP forwarding via middleware', () => {
  beforeAll(async () => {
    await startMcpServer({ host: HOST, port: PORT, endpoint: '/mcp', logsRoute: '/__client-logs' });
  }, 30_000);

  afterAll(async () => {
    // streamable server persists for the test process
  });

  it('forwards browser logs to MCP ingest', async () => {
    const { server, handlers } = makeServerMock();
    const plugin = browserEcho({ mcp: { url: BASE, suppressTerminal: true } });
    (plugin as any).configureServer(server);
    const [route, fn] = handlers[0];
    expect(route).toBe('/__client-logs');

    // simulate incoming POST to vite middleware
    const req: any = new (class {
      method = 'POST';
      listeners: any = {};
      on(evt: string, cb: any) { this.listeners[evt] = cb; }
      trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
    })();
    const res: any = { statusCode: 0, end: (cb?: any) => cb?.() };
    const payload = JSON.stringify({ sessionId: 'v1teee2e', entries: [{ level: 'error', text: 'vite→mcp e2e' }] });
    setTimeout(() => req.trigger(Buffer.from(payload)), 0);
    await new Promise<void>((resolve) => { res.end = () => { resolve(); }; fn(req, res, () => {}); });
    expect(res.statusCode).toBe(204);

    // give the async forward a moment
    await new Promise((r) => setTimeout(r, 200));
    const diag = await httpGet(`${BASE}/__client-logs`);
    expect(diag.status).toBe(200);
    expect(diag.text).toContain('vite→mcp e2e');
  });
});


