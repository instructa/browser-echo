import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMcpServer } from '../src/index';

const HOST = '127.0.0.1';
const PORT = 5181; // use a non-default port to avoid clashes with stdio test
const BASE = `http://${HOST}:${PORT}`;

async function httpPost(path: string, body: any, headers: Record<string,string> = {}) {
  return await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

async function httpGet(path: string, headers: Record<string,string> = {}) {
  return await fetch(`${BASE}${path}`, { method: 'GET', headers });
}

describe('@browser-echo/mcp streamable HTTP transport (smoke)', () => {
  beforeAll(async () => {
    await startMcpServer({ host: HOST, port: PORT, endpoint: '/mcp', logsRoute: '/__client-logs' });
  }, 30_000);

  afterAll(async () => {
    // streamable server keeps running for the test process; no explicit stop API exposed
  });

  it('exposes health endpoint and rejects GET /mcp without session id', async () => {
    const health = await httpGet('/health');
    expect(health.status).toBe(200);
    const txt = await health.text();
    expect(txt).toBe('ok');

    const resNoSid = await httpGet('/mcp');
    expect(resNoSid.status).toBe(405);
  });

  it('ingests a browser log and shows in GET diagnostics', async () => {
    const payload = { sessionId: 'feedf00d', entries: [{ level: 'warn', text: 'http smoke' }] };
    const ingest = await httpPost('/__client-logs', payload);
    expect(ingest.status).toBe(204);

    const diag = await httpGet('/__client-logs');
    expect(diag.status).toBe(200);
    const body = await diag.text();
    expect(body).toContain('http smoke');
  });

  it('returns 400 on invalid MCP-Protocol-Version header', async () => {
    const res = await httpPost('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { 'MCP-Protocol-Version': 'not-a-version' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-initialize POST without Mcp-Session-Id', async () => {
    const res = await httpPost('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'MCP-Protocol-Version': '2025-06-18' });
    expect(res.status).toBe(400);
  });
});


