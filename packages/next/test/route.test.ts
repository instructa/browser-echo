import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { POST } from '../src/route';

it('accepts payload and returns 204', async () => {
  const req: any = { json: async () => ({ sessionId: 'deadbeef', entries: [{ level: 'info', text: 'hi next' }] }) };
  const res: any = await POST(req);
  // NextResponse has private fields; just check status
  expect((res as any).status).toBe(204);
});

it('returns 400 on invalid JSON', async () => {
  const req: any = { json: async () => { throw new Error('bad'); } };
  const res: any = await POST(req);
  expect((res as any).status).toBe(400);
});

it('prints to terminal when MCP not configured', async () => {
  const i = vi.spyOn(console, 'log').mockImplementation(() => {});
  const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const e = vi.spyOn(console, 'error').mockImplementation(() => {});

  const req: any = {
    json: async () => ({
      sessionId: 'facade12',
      entries: [
        { level: 'info', text: 'nxt info' },
        { level: 'warn', text: 'nxt warn' },
        { level: 'error', text: 'nxt error' }
      ]
    })
  };
  const res: any = await POST(req);
  expect((res as any).status).toBe(204);
  // prints at least one level
  expect(i.mock.calls.length + w.mock.calls.length + e.mock.calls.length).toBeGreaterThan(0);
  i.mockRestore(); w.mockRestore(); e.mockRestore();
});

it('suppresses terminal when MCP URL set and no override', async () => {
  const i = vi.spyOn(console, 'info').mockImplementation(() => {});
  const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const e = vi.spyOn(console, 'error').mockImplementation(() => {});
  const old = process.env.BROWSER_ECHO_MCP_URL;
  process.env.BROWSER_ECHO_MCP_URL = 'http://localhost:5179';
  try {
    const req: any = {
      json: async () => ({
        sessionId: 'abc12345',
        entries: [{ level: 'info', text: 'hidden' }]
      })
    };
    const res: any = await POST(req as any);
    expect((res as any).status).toBe(204);
    // should not print
    expect(i).not.toHaveBeenCalled();
    expect(w).not.toHaveBeenCalled();
    expect(e).not.toHaveBeenCalled();
  } finally {
    process.env.BROWSER_ECHO_MCP_URL = old;
    i.mockRestore(); w.mockRestore(); e.mockRestore();
  }
});

it('normalizes MCP URL (strips /mcp) and forwards to ingest', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url); calls.push(u);
    if (u.endsWith('/health')) return { ok: true } as any;
    return { ok: true } as any;
  }) as any;
  // Write project json with /mcp suffix to ensure normalization
  const base = mkdtempSync(join(tmpdir(), 'be-next-url-'));
  const oldCwd = process.cwd();
  process.chdir(base);
  writeFileSync(join(base, '.browser-echo-mcp.json'), JSON.stringify({ url: 'http://localhost:5179/mcp', route: '/__client-logs', timestamp: Date.now() }));
  try {
    vi.resetModules();
    const mod = await import('../src/route');
    const req: any = { json: async () => ({ sessionId: 'beefcafe', entries: [{ level: 'info', text: 'x' }] }) };
    const res: any = await mod.POST(req);
    expect((res as any).status).toBe(204);
    expect(calls.some((u) => u === 'http://localhost:5179/__client-logs')).toBe(true);
    expect(calls.some((u) => u.includes('/mcp/__client-logs'))).toBe(false);
  } finally {
    process.chdir(oldCwd);
    try { rmSync(base, { recursive: true, force: true }); } catch {}
    globalThis.fetch = REAL_FETCH;
  }
});

it('does not fall back to 5179; prints when no project JSON present', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  globalThis.fetch = vi.fn(async () => ({ ok: true } as any)) as any;
  try {
    vi.resetModules();
    const mod = await import('../src/route');
    const i = vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req: any = { json: async () => ({ sessionId: 'deadbabe', entries: [{ level: 'warn', text: 'y' }] }) };
    const res: any = await mod.POST(req);
    expect((res as any).status).toBe(204);
    // No project JSON → prints to terminal
    expect(w).toHaveBeenCalled();
    i.mockRestore(); w.mockRestore(); e.mockRestore();
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

it('walks up directories to find discovery file and forwards', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url); calls.push(u);
    if (u.endsWith('/health')) return { ok: true } as any;
    return { ok: true } as any;
  }) as any;
  const oldCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), 'be-next-walk-'));
  const sub = join(base, 'a', 'b');
  mkdirSync(sub, { recursive: true });
  try {
    writeFileSync(join(base, '.browser-echo-mcp.json'), JSON.stringify({ url: 'http://127.0.0.1:59998', route: '/__client-logs', timestamp: Date.now() }));
    process.chdir(sub);
    vi.resetModules();
    const mod = await import('../src/route');
    const req: any = { json: async () => ({ sessionId: 'walkbeef', entries: [{ level: 'error', text: 'z' }] }) };
    const res: any = await mod.POST(req);
    expect((res as any).status).toBe(204);
    expect(calls.some((u) => u === 'http://127.0.0.1:59998/__client-logs')).toBe(true);
  } finally {
    process.chdir(oldCwd);
    try { rmSync(base, { recursive: true, force: true }); } catch {}
    globalThis.fetch = REAL_FETCH;
  }
});

it('ignores malformed discovery file gracefully and keeps printing', async () => {
  const oldCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), 'be-next-bad-'));
  const sub = join(base, 'x', 'y');
  mkdirSync(sub, { recursive: true });
  const REAL_FETCH = globalThis.fetch as any;
  const oldEnv = process.env.NODE_ENV;
  const oldUrl = process.env.BROWSER_ECHO_MCP_URL;
  process.env.NODE_ENV = 'development';
  delete process.env.BROWSER_ECHO_MCP_URL;
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/health')) return { ok: false } as any;
    return { ok: true } as any;
  }) as any;
  try {
    writeFileSync(join(base, '.browser-echo-mcp.json'), 'not json {');
    process.chdir(sub);
    vi.resetModules();
    const mod = await import('../src/route');
    const i = vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req: any = { json: async () => ({ sessionId: 'racecafe', entries: [
      { level: 'info', text: 'A' }, { level: 'warn', text: 'B' }, { level: 'error', text: 'C' }
    ] }) };
    const res: any = await mod.POST(req);
    expect((res as any).status).toBe(204);
    expect(i).toHaveBeenCalled();
    expect(w).toHaveBeenCalled();
    expect(e).toHaveBeenCalled();
    i.mockRestore(); w.mockRestore(); e.mockRestore();
  } finally {
    process.chdir(oldCwd);
    try { rmSync(base, { recursive: true, force: true }); } catch {}
    process.env.NODE_ENV = oldEnv;
    if (oldUrl) process.env.BROWSER_ECHO_MCP_URL = oldUrl; else delete process.env.BROWSER_ECHO_MCP_URL;
    globalThis.fetch = REAL_FETCH;
  }
});

it('recovers when fs read throws during discovery (race)', async () => {
  const REAL_FETCH = globalThis.fetch as any;
  const oldEnv = process.env.NODE_ENV;
  const oldUrl = process.env.BROWSER_ECHO_MCP_URL;
  process.env.NODE_ENV = 'development';
  delete process.env.BROWSER_ECHO_MCP_URL;
  globalThis.fetch = vi.fn(async (url: any) => ({ ok: false } as any)) as any; // no MCP found
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
    const mod = await import('../src/route');
    const i = vi.spyOn(console, 'info').mockImplementation(() => {});
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req: any = { json: async () => ({ sessionId: 'deadfeed', entries: [
      { level: 'warn', text: 'B' }
    ] }) };
    const res: any = await mod.POST(req);
    expect((res as any).status).toBe(204);
    expect(i).not.toHaveBeenCalled();
    expect(w).toHaveBeenCalled();
    i.mockRestore(); w.mockRestore(); e.mockRestore();
  } finally {
    process.env.NODE_ENV = oldEnv;
    if (oldUrl) process.env.BROWSER_ECHO_MCP_URL = oldUrl; else delete process.env.BROWSER_ECHO_MCP_URL;
    globalThis.fetch = REAL_FETCH;
    vi.resetModules();
    vi.unmock('node:fs');
  }
});
