import { describe, it, expect, vi } from 'vitest';
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
  expect(i).toHaveBeenCalled();
  expect(w).toHaveBeenCalled();
  expect(e).toHaveBeenCalled();
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
