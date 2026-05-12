import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBrowserEchoMcpTarget } from '../src/server';

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

  it('rejects non-local URLs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-remote-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({
        url: 'https://example.com/mcp',
        route: '/__client-logs',
      }));

      expect(resolveBrowserEchoMcpTarget(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('defaults unsafe routes to the log endpoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'be-core-route-'));
    try {
      writeFileSync(join(dir, '.browser-echo-mcp.json'), JSON.stringify({
        url: 'http://127.0.0.1:5179',
        route: '//evil.test/path',
      }));

      expect(resolveBrowserEchoMcpTarget(dir)?.routeLogs).toBe('/__client-logs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
