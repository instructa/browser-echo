import { defineEventHandler } from 'h3';
import { handleMcpHttpRequest, startMcpServer } from '@browser-echo/mcp';

export default defineEventHandler(async (event) => {
  // Ensure MCP server is ready
  try { startMcpServer(); } catch {}

  const req = event.node.req;
  const res = event.node.res;

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve());
      req.on('error', reject);
    });
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    await handleMcpHttpRequest(req, res, body);
    return;
  }

  await handleMcpHttpRequest(req, res);
});