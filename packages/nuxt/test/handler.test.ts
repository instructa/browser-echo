import { describe, it, expect, vi } from 'vitest';

// Mock h3 to drive the handler in isolation without resolving the real package
vi.mock('h3', async () => {
  return {
    defineEventHandler: (fn: any) => fn,
    readBody: async () => ({ sessionId: 'abcdef12', entries: [{ level: 'warn', text: 'nuxt hello', stack: 'at x:1:1' }] }),
    setResponseStatus: (event: any, code: number) => { event.status = code; }
  };
}, { virtual: true });

import handler from '../src/runtime/server/handler';

it('prints forwarded logs and returns 204', async () => {
  const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const e = {} as any;
  const res = await handler(e);
  expect(e.status).toBe(204);
  expect(res).toBe('');
  expect(w).toHaveBeenCalled();
  w.mockRestore();
});

it('returns 400 on invalid JSON', async () => {
  // Remock h3 readBody to throw
  const mod = await vi.importMock('h3') as any;
  mod.readBody = async () => { throw new Error('bad'); };
  const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const e = {} as any;
  const result = await (await import('../src/runtime/server/handler')).default(e);
  expect(e.status).toBe(400);
  // no print expected path guarantee; just ensure handler returns string
  expect(typeof result).toBe('string');
  w.mockRestore();
});
