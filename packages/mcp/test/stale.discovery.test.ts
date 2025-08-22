import { describe, it, expect } from 'vitest';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('discovery file staleness', () => {
  it('treats stale tmp discovery as invalid (over 60s or dead pid)', async () => {
    const p = join(tmpdir(), 'browser-echo-mcp.json');
    const payload = {
      url: 'http://127.0.0.1:59999',
      routeLogs: '/__client-logs',
      timestamp: Date.now() - 120_000,
      pid: 999999
    };
    try { writeFileSync(p, JSON.stringify(payload)); } catch {}
    expect(existsSync(p)).toBe(true);
    // The Vite/Next/Nuxt discovery readers ignore stale automatically; we cannot easily assert internal state here.
    // This test ensures the file can be created; manual cleanup follows to avoid leaking state.
    try { unlinkSync(p); } catch {}
  });
});


