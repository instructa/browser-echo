import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { McpTestClient } from './utils/mcpTestClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('@browser-echo/mcp stdio prefers 5179 and writes discovery to cwd', () => {
  let client: McpTestClient;
  let workDir: string;

  beforeAll(async () => {
    const cli = join(__dirname, '..', 'bin', 'cli.mjs');
    workDir = mkdtempSync(join(tmpdir(), 'be-mcp-port-'));
    client = new McpTestClient({ cliEntryPoint: cli, env: { BROWSER_ECHO_INGEST_PORT: '5179' }, cwd: workDir });
    await client.connect();
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  });

  it('writes .browser-echo-mcp.json only to project root (cwd) with preferred port (5179 if free or fallback ephemeral)', async () => {
    // allow up to 2s for discovery file to appear
    const disc = join(workDir, '.browser-echo-mcp.json');
    const start = Date.now();
    while (!existsSync(disc) && (Date.now() - start) < 2000) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(existsSync(disc)).toBe(true);
    const raw = readFileSync(disc, 'utf-8');
    const data = JSON.parse(raw);
    expect(String(data.url)).toMatch(/^http:\/\/127\.0\.0\.1:(\d{2,5})$/);
    // Should not write legacy tmp discovery
    const tmpDisc = join(tmpdir(), 'browser-echo-mcp.json');
    expect(existsSync(tmpDisc)).toBe(false);
  });
});


