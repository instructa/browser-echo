import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import browserEcho from '../src/index';

function makeServerMock() {
  const logs: Array<[string, string]> = [];
  const logger = {
    info: (m: string) => logs.push(['info', m]),
    warn: (m: string) => logs.push(['warn', m]),
    error: (m: string) => logs.push(['error', m])
  };
  const handlers: any[] = [];
  const server: any = {
    config: { logger },
    middlewares: { use: (route: string, fn: Function) => handlers.push([route, fn]) }
  };
  return { server, logs, handlers };
}

const REAL_FETCH = globalThis.fetch as any;
const env = process.env;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  process.env = { ...env };
  delete process.env.BROWSER_ECHO_MCP_URL;
  delete process.env.BROWSER_ECHO_MCP_LOGS_ROUTE;
  delete process.env.BROWSER_ECHO_SUPPRESS_TERMINAL;
});

describe('Vite plugin configuration (smoke)', () => {
  it('applies defaults and merges nested batch options', async () => {
    const p = browserEcho({ batch: { size: 99 } });
    const rid = (p as any).resolveId?.('virtual:browser-echo');
    const code: string = (p as any).load?.(rid);
    expect(typeof code).toBe('string');
    // Default route and merged batch values appear in the virtual module
    expect(code).toContain('const ROUTE = "/__client-logs"');
    expect(code).toContain('const BATCH_SIZE = 99');
    expect(code).toContain('const BATCH_INTERVAL = 300');
  });

  it('forwards to MCP and suppresses terminal when MCP URL is set', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true } as any));
    globalThis.fetch = fetchSpy as any;

    const { server, logs, handlers } = makeServerMock();
    const p = browserEcho({ mcp: { url: 'http://localhost:5179' } });
    (p as any).configureServer(server);
    expect(handlers.length).toBe(1);

    const [route, fn] = handlers[0];
    expect(route).toBe('/__client-logs');

    // simulate POST
    const req: any = new (class {
      method = 'POST';
      listeners: Record<string, Function> = {};
      on(evt: string, cb: any) { this.listeners[evt] = cb; }
      trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
    })();
    const res: any = { statusCode: 0, end: vi.fn() };

    const payload = JSON.stringify({ sessionId: 'abc12345', entries: [{ level: 'log', text: 'hi suppr' }] });
    const done = new Promise<void>((resolve) => { res.end = vi.fn(() => resolve()); });
    setTimeout(() => req.trigger(Buffer.from(payload)), 0);
    fn(req, res, () => {});
    await done;

    // Should have forwarded to default ingest route and not printed payload to terminal
    expect(fetchSpy).toHaveBeenCalled();
    const urlArg = (fetchSpy.mock.calls[0] || [])[0];
    expect(String(urlArg)).toBe('http://localhost:5179/__client-logs');
    expect(logs.some(([, m]) => m.includes('hi suppr'))).toBe(false);
  });

  it('uses custom logs route and forces print when suppressTerminal=false', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true } as any));
    globalThis.fetch = fetchSpy as any;

    const { server, logs, handlers } = makeServerMock();
    const p = browserEcho({ mcp: { url: 'http://localhost:5179', routeLogs: '/custom-ingest', suppressTerminal: false } });
    (p as any).configureServer(server);
    expect(handlers.length).toBe(1);

    const [route, fn] = handlers[0];
    expect(route).toBe('/__client-logs');

    // simulate POST
    const req: any = new (class {
      method = 'POST';
      listeners: Record<string, Function> = {};
      on(evt: string, cb: any) { this.listeners[evt] = cb; }
      trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
    })();
    const res: any = { statusCode: 0, end: vi.fn() };

    const payload = JSON.stringify({ sessionId: 'deadbeef', entries: [{ level: 'log', text: 'hi print' }] });
    const done = new Promise<void>((resolve) => { res.end = vi.fn(() => resolve()); });
    setTimeout(() => req.trigger(Buffer.from(payload)), 0);
    fn(req, res, () => {});
    await done;

    // Forwarded to custom ingest route and printed to terminal due to SUPPRESS_TERMINAL=0
    expect(fetchSpy).toHaveBeenCalled();
    const urlArg = (fetchSpy.mock.calls[0] || [])[0];
    expect(String(urlArg)).toBe('http://localhost:5179/custom-ingest');
    expect(logs.some(([, m]) => m.includes('hi print'))).toBe(true);
  });

  it('virtual module contains include and route fields without MCP', async () => {
    const p = browserEcho({ include: ['error'], route: '/__client-logs' });
    const rid = (p as any).resolveId?.('virtual:browser-echo');
    const code: string = (p as any).load?.(rid);
    expect(code).toContain('const INCLUDE = ["error"]');
    expect(code).toContain('const ROUTE = "/__client-logs"');
    expect(code).not.toContain('BROWSER_ECHO_MCP');
  });
});


