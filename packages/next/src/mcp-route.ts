import type { NextRequest } from 'next/server';
import { ensureLocalHttpServer, getLocalMcpUrl } from '@browser-echo/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Utilities to forward request/response while preserving streaming/SSE.
function copyHeaders(src: Headers): Headers {
  const dst = new Headers();
  // Forward all headers; MCP tools often rely on "Mcp-Session-Id"
  src.forEach((v, k) => dst.append(k, v));
  return dst;
}

async function proxy(method: string, req: NextRequest): Promise<Response> {
  await ensureLocalHttpServer();
  const upstreamUrl = getLocalMcpUrl();

  // Build init for fetch
  const init: RequestInit = {
    method,
    headers: copyHeaders(req.headers)
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const buf = Buffer.from(await req.arrayBuffer());
    init.body = buf;
  }

  // Stream response back to the client
  const upstream = await fetch(upstreamUrl, init);
  const headers = copyHeaders(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
}

export async function GET(req: NextRequest) {
  return proxy('GET', req);
}

export async function POST(req: NextRequest) {
  return proxy('POST', req);
}

export async function DELETE(req: NextRequest) {
  return proxy('DELETE', req);
}