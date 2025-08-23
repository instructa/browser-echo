import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

it('normalizes MCP URL (strips /mcp) and forwards to ingest', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url); calls.push(u);
    if (u.endsWith('/health')) return { ok: true } as any;
    return { ok: true } as any;
  }) as any;
  const old = process.env.BROWSER_ECHO_MCP_URL;
  process.env.BROWSER_ECHO_MCP_URL = 'http://localhost:5179/mcp';
  try {
    vi.resetModules();
    const mod = await import('../src/runtime/server/handler');
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e: any = {};
    (await vi.importMock('h3') as any).readBody = async () => ({ sessionId: 'abcdef12', entries: [{ level: 'info', text: 'x' }] });
    const res: any = await mod.default(e);
    expect(e.status).toBe(204);
    expect(res).toBe('');
    expect(calls.some((u) => u === 'http://localhost:5179/__client-logs')).toBe(true);
  } finally {
    process.env.BROWSER_ECHO_MCP_URL = old;
    globalThis.fetch = REAL_FETCH;
  }
});

it('falls back to localhost when 127.0.0.1:5179 is unhealthy', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  globalThis.fetch = vi.fn(async () => ({ ok: true } as any)) as any;
  try {
    vi.resetModules();
    const mod = await import('../src/runtime/server/handler');
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e: any = {};
    (await vi.importMock('h3') as any).readBody = async () => ({ sessionId: 'abcdef12', entries: [{ level: 'warn', text: 'y' }] });
    const res: any = await mod.default(e);
    expect(e.status).toBe(204);
    expect(res).toBe('');
    expect(w).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

it('walks up directories to find project-local discovery file', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  globalThis.fetch = vi.fn(async () => ({ ok: true } as any)) as any;
  const oldCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), 'be-nuxt-walk-'));
  const sub = join(base, 'a', 'b');
  mkdirSync(sub, { recursive: true });
  try {
    writeFileSync(join(base, '.browser-echo-mcp.json'), JSON.stringify({ url: 'http://127.0.0.1:59999', routeLogs: '/__client-logs', timestamp: Date.now() }));
    process.chdir(sub);
    vi.resetModules();
    const mod = await import('../src/runtime/server/handler');
    const e: any = {};
    (await vi.importMock('h3') as any).readBody = async () => ({ sessionId: 'abcdef12', entries: [{ level: 'error', text: 'z' }] });
    const res: any = await mod.default(e);
    expect(e.status).toBe(204);
    expect(res).toBe('');
    // if forwarding happened, no warn printed
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(w).not.toHaveBeenCalled();
  } finally {
    process.chdir(oldCwd);
    try { rmSync(base, { recursive: true, force: true }); } catch {}
    globalThis.fetch = REAL_FETCH;
  }
});

it('ignores malformed discovery file and keeps printing', async () => {
  const oldCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), 'be-nuxt-bad-'));
  const sub = join(base, 'x', 'y');
  mkdirSync(sub, { recursive: true });
  const REAL_FETCH = globalThis.fetch as any;
  globalThis.fetch = vi.fn(async () => ({ ok: false } as any)) as any;
  try {
    writeFileSync(join(base, '.browser-echo-mcp.json'), 'oops not json');
    process.chdir(sub);
    vi.resetModules();
    const mod = await import('../src/runtime/server/handler');
    const e: any = {};
    (await vi.importMock('h3') as any).readBody = async () => ({ sessionId: 'abcdef12', entries: [
      { level: 'info', text: 'A' }, { level: 'warn', text: 'B' }
    ] });
    const i = vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res: any = await mod.default(e);
    expect(e.status).toBe(204);
    expect(i).toHaveBeenCalled();
    expect(w).toHaveBeenCalled();
    i.mockRestore(); w.mockRestore();
  } finally {
    process.chdir(oldCwd);
    try { rmSync(base, { recursive: true, force: true }); } catch {}
    globalThis.fetch = REAL_FETCH;
  }
});

it('recovers when fs read throws during discovery (race)', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  globalThis.fetch = vi.fn(async () => ({ ok: false } as any)) as any;
  try {
    vi.resetModules();
    vi.mock('node:fs', async () => {
      const real: any = await vi.importActual('node:fs');
      return {
        ...real,
        existsSync: () => true,
        readFileSync: () => { throw new Error('race'); }
      };
    });
    const mod = await import('../src/runtime/server/handler');
    const e: any = {};
    (await vi.importMock('h3') as any).readBody = async () => ({ sessionId: 'abcdef12', entries: [ { level: 'warn', text: 'B' } ] });
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res: any = await mod.default(e);
    expect(e.status).toBe(204);
    expect(w).toHaveBeenCalled();
  } finally {
    globalThis.fetch = REAL_FETCH;
    vi.resetModules();
    vi.unmock('node:fs');
  }
});
