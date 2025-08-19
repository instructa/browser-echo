import { describe, it, expect, vi } from 'vitest';
import browserEcho from '../src/index';

function makeServerMock() {
  const logs: any[] = [];
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

it('injects virtual script in index.html', () => {
  const p = browserEcho();
  const out = (p as any).transformIndexHtml?.('<html></html>');
  expect(out?.tags?.[0]?.attrs?.src).toContain('/@id/virtual:browser-echo');
});

it('registers middleware and prints logs', async () => {
  const { server, logs, handlers } = makeServerMock();
  const p = browserEcho();
  (p as any).configureServer(server);
  expect(handlers.length).toBe(1);

  const [route, fn] = handlers[0];
  expect(route).toBe('/__client-logs');

  // simulate POST
  const req: any = new (class {
    method = 'POST';
    listeners: any = {};
    on(evt: string, cb: any) { this.listeners[evt] = cb; }
    trigger(data: any) { this.listeners['data']?.(data); this.listeners['end']?.(); }
  })();
  const res: any = { statusCode: 0, end: vi.fn() };

  const payload = JSON.stringify({ sessionId: 'abc12345', entries: [{ level: 'log', text: 'hi' }] });
  const done = new Promise<void>((resolve) => { res.end = vi.fn(() => resolve()); });
  setTimeout(() => req.trigger(Buffer.from(payload)), 0);
  // invoke middleware; it handles the request and will call res.end when done
  fn(req, res, () => {});
  await done;
  expect(res.statusCode).toBe(204);
  expect(logs.some(([lvl, m]) => lvl === 'info' && m.includes('[ABC12345') === false)).toBeTruthy();
});
