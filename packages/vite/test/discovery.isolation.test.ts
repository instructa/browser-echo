import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

function writeLocalDiscovery(payload: any) {
  const p = join(process.cwd(), '.browser-echo-mcp.json');
  writeFileSync(p, JSON.stringify(payload));
  return p;
}

beforeEach(() => {
  vi.resetModules();
  // Ensure no pre-existing discovery files interfere
  const local = join(process.cwd(), '.browser-echo-mcp.json');
  const tmp = join(tmpdir(), 'browser-echo-mcp.json');
  try { if (existsSync(local)) unlinkSync(local); } catch {}
  try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  const pLocal = join(process.cwd(), '.browser-echo-mcp.json');
  try { if (existsSync(pLocal)) unlinkSync(pLocal); } catch {}
});

describe('Discovery behavior (local file + port 5179)', () => {
  it('does not forward when no discovery and port 5179 is down', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false } as any));
    globalThis.fetch = fetchSpy as any;

    const { server, logs, handlers } = makeServerMock();
    const p = browserEcho();
    (p as any).configureServer(server);
    const [route, fn] = handlers[0];
    expect(route).toBe('/__client-logs');

    // simulate POST with a log entry
    const req: any = new (class {
      method = 'POST';
      listeners: Record<string, Function> = {};
      on(evt: string, cb: any) { this.listeners[evt] = cb; }
      trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
    })();
    const res: any = { statusCode: 0, end: vi.fn() };
    const payload = JSON.stringify({ sessionId: 'isolate01', entries: [{ level: 'log', text: 'hi iso' }] });
    const done = new Promise<void>((resolve) => { res.end = vi.fn(() => resolve()); });
    setTimeout(() => req.trigger(Buffer.from(payload)), 0);
    fn(req, res, () => {});
    await done;

    // Should NOT have forwarded (no fetch calls to ingest)
    const calls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('/__client-logs'))).toBe(false);
    // Terminal should have printed something
    expect(logs.length).toBeGreaterThan(0);
  });

  it('honors local discovery and forwards', async () => {
    writeLocalDiscovery({
      url: 'http://127.0.0.1:59992',
      routeLogs: '/__client-logs',
      timestamp: Date.now(),
      pid: 999998
    });

    const fetchSpy = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/health')) return { ok: true } as any; // make discovery healthy
      return { ok: true } as any;
    });
    globalThis.fetch = fetchSpy as any;

    const { server, logs, handlers } = makeServerMock();
    const p = browserEcho();
    (p as any).configureServer(server);
    const [route, fn] = handlers[0];
    expect(route).toBe('/__client-logs');

    const req: any = new (class {
      method = 'POST';
      listeners: Record<string, Function> = {};
      on(evt: string, cb: any) { this.listeners[evt] = cb; }
      trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
    })();
    const res: any = { statusCode: 0, end: vi.fn() };
    const payload = JSON.stringify({ sessionId: 'isolate02', entries: [{ level: 'info', text: 'hi fwd' }] });
    const done = new Promise<void>((resolve) => { res.end = vi.fn(() => resolve()); });
    setTimeout(() => req.trigger(Buffer.from(payload)), 0);
    fn(req, res, () => {});
    await done;

    // Should have forwarded to discovered ingest
    const calls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u === 'http://127.0.0.1:59992/__client-logs')).toBe(true);
    // Terminal should be suppressed (no direct log message with payload text)
    expect(logs.some(([, m]) => m.includes('hi fwd'))).toBe(false);
  });
});


