import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { forwardBrowserEchoPayload, resolveBrowserEchoMcpTarget } from '../src/server';

describe('server MCP discovery', () => {
  it('normalizes local MCP URLs and legacy routeLogs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-mcp-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({
        url: 'http://localhost:5179/mcp',
        routeLogs: '/__client-logs',
      }));

      expect(resolveBrowserEchoMcpTarget(dir)).toEqual({
        url: 'http://localhost:5179',
        routeLogs: '/__client-logs',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    'https://example.test/mcp',
    'http://localhost.example.test/mcp',
    'http://127.0.0.1.example.test/mcp',
    'http://user@localhost/mcp',
  ])('rejects an invalid discovery URL (%s)', (url) => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-remote-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({
        url,
        route: '/__client-logs',
      }));

      expect(resolveBrowserEchoMcpTarget(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    '//example.test/path',
    String.raw`/\example.test/path`,
  ])('defaults unsafe routes to the log endpoint (%s)', (route) => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-route-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({
        url: 'http://127.0.0.1:5179',
        route,
      }));

      expect(resolveBrowserEchoMcpTarget(dir)?.routeLogs).toBe('/__client-logs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks redirects in automatic forwarding even without a compatible abort signal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-redirect-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({ url: 'http://localhost:5179' }));
      const fetchImpl = vi.fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('Incompatible AbortSignal'))
        .mockResolvedValueOnce({ ok: false } as Response);

      expect(await forwardBrowserEchoPayload({}, { cwd: dir, fetchImpl })).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      for (const [, init] of fetchImpl.mock.calls) expect(init?.redirect).toBe('error');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
