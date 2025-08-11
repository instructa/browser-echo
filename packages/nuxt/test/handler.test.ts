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
