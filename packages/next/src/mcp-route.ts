import type { NextRequest } from 'next/server';
import { ensureLocalHttpServer, getLocalMcpUrl } from '@browser-echo/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Utilities to forward request/response while preserving streaming/SSE.
function copyHeaders(src: Headers): Headers {
  const dst = new Headers();
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-length',
    'host',
  ]);
  src.forEach((v, k) => {
    if (!hopByHop.has(k.toLowerCase())) {
      dst.append(k, v);
    }
  });
  return dst;
}

async function proxy(method: string, req: NextRequest): Promise<Response> {
  try {
    await ensureLocalHttpServer();
  } catch (err: any) {
    const message = `[browser-echo] MCP server failed to start: ${err?.message || String(err)}`;
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  // Build upstream URL and preserve query string
  const upstreamBase = new URL(getLocalMcpUrl());
  const upstreamUrl = new URL(upstreamBase.toString());
  const qs = req.nextUrl.search;
  if (qs) upstreamUrl.search = qs;

  // Prepare headers to forward; nuke hop-by-hop headers
  const forwardHeaders = copyHeaders(req.headers);

  // Ensure SSE friendliness on GET (defensive in case a client omits Accept)
  if (method === 'GET') {
    const accept = forwardHeaders.get('accept') || '';
    if (!/\btext\/event-stream\b/i.test(accept)) {
      forwardHeaders.set('accept', accept ? `${accept}, text/event-stream` : 'text/event-stream');
    }
    forwardHeaders.set('connection', 'keep-alive');
    // Clients are recommended to include MCP-Protocol-Version; we simply forward what we received.
  }

  // Build init for fetch
  const init: RequestInit = {
    method,
    headers: forwardHeaders
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const buf = Buffer.from(await req.arrayBuffer());
    init.body = buf as any;
  }

  // Stream response back to the client
  const upstream = await fetch(upstreamUrl, init);

  // Copy upstream response headers, then harden for SSE responses
  const respHeaders = copyHeaders(upstream.headers);
  const ct = upstream.headers.get('content-type') || '';

  if (/^text\/event-stream\b/i.test(ct)) {
    // Prevent buffering and keep the connection alive for SSE
    respHeaders.set('content-type', 'text/event-stream');
    respHeaders.set('cache-control', 'no-cache, no-transform');
    respHeaders.set('connection', 'keep-alive');
    // Disable proxy buffering where applicable (e.g., nginx)
    respHeaders.set('x-accel-buffering', 'no');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
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

export async function OPTIONS(req: NextRequest) {
  return proxy('OPTIONS', req);
}