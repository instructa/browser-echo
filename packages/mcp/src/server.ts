import { createServer as createNodeServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { createApp, createRouter, defineEventHandler, getQuery, readRawBody, setResponseStatus, toNodeListener } from 'h3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { LogStore, normalizeLevel, type BrowserLogLevel } from './store';
import { registerTools } from './tools';
import { registerResources } from './resources';

/** Create the bare MCP server instance */
export function createServer(options: { name: string, version: string }): McpServer {
  const { name, version } = options;
  return new McpServer({ name, version });
}

interface HttpOptions {
  type: 'http';
  port: number;
  host: string;
  endpoint: `/${string}`;
  logsRoute: `/${string}`;
}

export type StartOptions = HttpOptions;

/**
 * Starts the given MCP server with HTTP transport.
 */
export async function startServer(
  server: McpServer,
  options: StartOptions,
): Promise<void> {
  const { port, host, endpoint, logsRoute } = options;

  // Create store
  const bufferMax = Number(process.env.BROWSER_ECHO_BUFFER_SIZE ?? 1000) | 0;
  const store = new LogStore(bufferMax > 0 ? bufferMax : 1000);

  // Register tools and resources
  const context = { mcp: server, store };
  registerTools(context);
  registerResources(context);

  // Start HTTP server
  await startHttpServer(server, store, { host, port, endpoint, logsRoute });
}

export async function stopServer(server: McpServer) {
  try {
    await server.close();
  }
  catch (error) {
    console.error('Error occurred during server stop:', error);
  }
  finally {
    process.exit(0);
  }
}

/** Start a standalone H3 HTTP server exposing:
 *  - MCP endpoint (POST for requests, GET for SSE) at {endpoint}
 *  - Log ingest/diagnostics at {logsRoute} (POST to append, GET to view)
 */
async function startHttpServer(mcp: McpServer, store: LogStore, opts: {
  host: string; port: number; endpoint: `/${string}`; logsRoute: `/${string}`;
}): Promise<void> {
  const app = createApp();
  const router = createRouter();

  // One Streamable HTTP transport per process (supports multiple clients via sessions)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    // Keep permissive by default for local dev; DNS rebinding protection can be enabled by deployers
    enableDnsRebindingProtection: false
  });

  await mcp.connect(transport);

  // MCP endpoint: POST (requests/notifications) and GET (SSE stream)
  router.use(opts.endpoint, defineEventHandler(async (event) => {
    try {
      // CORS / headers
      try {
        const res = event.node.res;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'content-type, accept, mcp-session-id, Mcp-Session-Id, mcp-protocol-version, MCP-Protocol-Version'
        );
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      } catch {}

      const method = String(event.node.req.method || '').toUpperCase();
      if (method === 'OPTIONS') {
        setResponseStatus(event, 204);
        return '';
      }

      // For GET/DELETE: require session id to prevent ambiguous streams without init
      if (method === 'GET' || method === 'DELETE') {
        const sidHeader = (event.node.req.headers['mcp-session-id'] as string | undefined) || '';
        if (!sidHeader) {
          setResponseStatus(event, 405);
          try {
            event.node.res.setHeader('Allow', 'POST');
            event.node.res.setHeader('content-type', 'application/json');
          } catch {}
          return JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed. First POST InitializeRequest, read Mcp-Session-Id, and include it (plus MCP-Protocol-Version) on subsequent GET/DELETE/POST.'
            },
            id: null
          });
        }
      }

      // Normalize body for POST
      let bodyBuf: Buffer | undefined;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const raw = await readRawBody(event);
        if (raw && typeof raw === 'string') bodyBuf = Buffer.from(raw);
        else if (raw && (raw as any) instanceof Uint8Array) bodyBuf = Buffer.from(raw as any);

        // Allow tool calls without explicit session id by assigning a default
        try {
          const reqHeaders: Record<string, string | string[] | undefined> = event.node.req.headers as any;
          const existingSid = reqHeaders['mcp-session-id'] || reqHeaders['Mcp-Session-Id'];
          if (!existingSid) {
            (event.node.req.headers as any)['mcp-session-id'] = 'default-session';
          }
        } catch {}
      }

      // Delegate to the SDK transport (writes to the Node response directly)
      await transport.handleRequest(event.node.req as any, event.node.res as any, bodyBuf ? JSON.parse(bodyBuf.toString('utf-8')) : undefined);
      // h3 will consider the response handled.
      return undefined as any;
    } catch (err) {
      setResponseStatus(event, 500);
      return JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }));

  // Attach log ingest routes
  app.use(createLogIngestRoutes(store, opts.logsRoute));

  // Health
  router.get('/health', defineEventHandler(() => 'ok'));

  app.use(router);

  const nodeServer = createNodeServer(toNodeListener(app));

  // Long-lived SSE stability
  try {
    nodeServer.requestTimeout = 0;
    nodeServer.headersTimeout = 0;
    typeof nodeServer.setTimeout === 'function' && nodeServer.setTimeout(0);
    nodeServer.on('connection', (socket: any) => {
      try {
        socket.setKeepAlive?.(true, 60_000);
        socket.setNoDelay?.(true);
      } catch {}
    });
  } catch {}

  await new Promise<void>((resolve) => nodeServer.listen(opts.port, opts.host, () => resolve()));
  // eslint-disable-next-line no-console
  console.log(`MCP (Streamable HTTP) listening → http://${opts.host}:${opts.port}${opts.endpoint}`);
  // eslint-disable-next-line no-console
  console.log(`Log ingest endpoint        → http://${opts.host}:${opts.port}${opts.logsRoute}`);
}

/** Create log ingest routes that can be attached to any H3 app */
function createLogIngestRoutes(store: LogStore, logsRoute: `/${string}`) {
  const router = createRouter();

  // Log diagnostics (GET) → text/plain
  router.get(logsRoute, defineEventHandler(async (event) => {
    const q = getQuery(event) as { session?: string };
    const text = store.toText(q?.session ? String(q.session).slice(0, 8) : undefined);
    try {
      event.node.res.setHeader('content-type', 'text/plain; charset=utf-8');
      event.node.res.setHeader('cache-control', 'no-store');
    } catch {}
    return text;
  }));

  // Log ingest (POST)
  router.post(logsRoute, defineEventHandler(async (event) => {
    try {
      const raw = await readRawBody(event);
      const payload = typeof raw === 'string' ? JSON.parse(raw) : (raw ? JSON.parse(Buffer.from(raw as any).toString('utf-8')) : undefined);
      if (!payload || !Array.isArray(payload.entries)) {
        setResponseStatus(event, 400);
        return 'invalid payload';
      }
      const sid = String(payload.sessionId ?? 'anon');
      for (const entry of payload.entries as Array<{ level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; }>) {
        const level = normalizeLevel(entry.level);
        store.append({
          sessionId: sid,
          level,
          text: String(entry.text ?? ''),
          time: entry.time,
          source: entry.source,
          stack: entry.stack,
          tag: '[browser]'
        });
      }
      setResponseStatus(event, 204);
      return '';
    } catch {
      setResponseStatus(event, 400);
      return 'invalid JSON';
    }
  }));

  return router;
}
