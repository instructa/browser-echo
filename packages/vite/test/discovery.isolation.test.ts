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

function writeTmpDiscovery(payload: any) {
  const p = join(tmpdir(), 'browser-echo-mcp.json');
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
  const p = join(tmpdir(), 'browser-echo-mcp.json');
  try { if (existsSync(p)) unlinkSync(p); } catch {}
});

describe('Isolation across projects (tmp discovery)', () => {
  it('ignores tmp discovery when projectRoot mismatches current project', async () => {
    // tmp discovery pointing elsewhere
    writeTmpDiscovery({
      url: 'http://127.0.0.1:59991',
      routeLogs: '/__client-logs',
      timestamp: Date.now(),
      pid: 999999,
      projectRoot: join(tmpdir(), 'some-other-project')
    });

    const fetchSpy = vi.fn(async () => ({ ok: true } as any));
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

    // Should NOT have forwarded (no fetch calls)
    expect(fetchSpy).not.toHaveBeenCalled();
    // Terminal should have printed something
    expect(logs.length).toBeGreaterThan(0);
  });

  it('honors tmp discovery when projectRoot matches and forwards with token', async () => {
    const token = 't123';
    writeTmpDiscovery({
      url: 'http://127.0.0.1:59992',
      routeLogs: '/__client-logs',
      timestamp: Date.now(),
      pid: 999998,
      projectRoot: process.cwd(),
      token
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

    // Should have forwarded to tmp-discovered ingest
    const calls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u === 'http://127.0.0.1:59992/__client-logs')).toBe(true);
    // And include token header
    const forwardCall = fetchSpy.mock.calls.find((c: any[]) => String(c[0]) === 'http://127.0.0.1:59992/__client-logs');
    const headers = forwardCall?.[1]?.headers || {};
    expect(headers['x-be-token']).toBe(token);
    // Terminal should be suppressed (no direct log message with payload text)
    expect(logs.some(([, m]) => m.includes('hi fwd'))).toBe(false);
  });
});


