import { createServer as createNodeServer } from 'node:http';
import { writeFileSync, rmSync, renameSync, appendFileSync, mkdirSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createApp, createRouter, defineEventHandler, getQuery, readRawBody, setResponseStatus, toNodeListener } from 'h3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

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

interface StdioOptions {
  type: 'stdio';
  /** Optional ingest host (default 127.0.0.1) */
  host?: string;
  /** Optional ingest port (default 5179) */
  port?: number;
  /** Optional ingest route (default /__client-logs) */
  logsRoute?: `/${string}`;
}

export type StartOptions = HttpOptions | StdioOptions;

/**
 * Starts the given MCP server with the selected transport.
 * - `http`: full Streamable HTTP (MCP endpoint + ingest).
 * - `stdio`: MCP over stdio + **ingest-only HTTP** so browsers/frameworks can POST logs.
 */
export async function startServer(
  server: McpServer,
  options: StartOptions,
): Promise<void> {
  // Create store
  const bufferMax = Number(process.env.BROWSER_ECHO_BUFFER_SIZE ?? 1000) | 0;
  const store = new LogStore(bufferMax > 0 ? bufferMax : 1000);

  // Register tools and resources
  const context = { mcp: server, store };
  registerTools(context);
  registerResources(context);

  if (options.type === 'stdio') {
    // Connect MCP over stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Always bring up an ingest-only HTTP endpoint so clients/frameworks can POST logs
    const host = options.host || '127.0.0.1';
    // Prefer stable 5179 for discovery; allow override via options/env; fallback handled in startIngestOnlyServer
    const envIngest = process.env.BROWSER_ECHO_INGEST_PORT;
    const preferred = (options.port ?? (envIngest ? Number(envIngest) | 0 : 5179)) | 0;
    const port = preferred > 0 ? preferred : 5179;
    const logsRoute = options.logsRoute || '/__client-logs';
    await startIngestOnlyServer(store, { host, port, logsRoute });

    // eslint-disable-next-line no-console
    console.error('MCP (stdio) listening on stdio (ingest HTTP active)');
    return;
  }

  // Streamable HTTP (MCP endpoint + ingest)
  const { port, host, endpoint, logsRoute } = options;
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
    // Best-effort cleanup of project JSON
    try { rmSync(joinPath(process.cwd(), '.browser-echo-mcp.json'), { force: true }); } catch {}
    process.exit(0);
  }
}

/** Start a Streamable HTTP server exposing:
 *  - MCP endpoint (POST/GET/DELETE) at {endpoint}
 *  - Log ingest/diagnostics at {logsRoute} (POST to append, GET to view)
 */
export async function startHttpServer(
  mcp: McpServer,
  store: LogStore,
  opts: { host: string; port: number; endpoint: `/${string}`; logsRoute: `/${string}` }
): Promise<void> {
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
      let isInitialize = false;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const raw = await readRawBody(event);
        if (raw && typeof raw === 'string') bodyBuf = Buffer.from(raw);
        else if (raw && (raw as any) instanceof Uint8Array) bodyBuf = Buffer.from(raw as any);

        // Validate MCP-Protocol-Version if provided (allow missing for backwards-compat)
        try {
          const ver = String((event.node.req.headers['mcp-protocol-version'] as any) || '').trim();
          if (ver && !['2025-06-18','2025-03-26','2024-11-05'].includes(ver)) {
            setResponseStatus(event, 400);
            try { event.node.res.setHeader('content-type','application/json'); } catch {}
            return JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported MCP-Protocol-Version' }, id: null });
          }
        } catch {}

        // Enforce session id for non-initialize requests
        try {
          const parsed = bodyBuf ? JSON.parse(bodyBuf.toString('utf-8')) : undefined;
          const rpcMethod = parsed && typeof parsed === 'object' ? String(parsed.method || '') : '';
          isInitialize = rpcMethod === 'initialize';
        } catch {}
        if (!isInitialize) {
          const sidHeader = (event.node.req.headers['mcp-session-id'] as string | undefined) || '';
          if (!sidHeader) {
            setResponseStatus(event, 400);
            try { event.node.res.setHeader('content-type', 'application/json'); } catch {}
            return JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Missing Mcp-Session-Id header' }, id: null });
          }
        }
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

  // Attach log ingest routes (with optional token validation via header)
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
  // For Streamable HTTP, we intentionally do not write project JSON here. The per-project
  // source of truth is written by the stdio ingest server only.

  // eslint-disable-next-line no-console
  console.log(`MCP (Streamable HTTP) listening → http://${opts.host}:${opts.port}${opts.endpoint}`);
  // eslint-disable-next-line no-console
  console.log(`Log ingest endpoint        → http://${opts.host}:${opts.port}${opts.logsRoute}`);
}

/** Start a minimal HTTP server exposing ONLY:
 *  - Log ingest/diagnostics at {logsRoute} (POST to append, GET to view)
 *  - /health (GET)
 * This is used when MCP transport is stdio.
 */
export async function startIngestOnlyServer(
  store: LogStore,
  opts: { host: string; port: number; logsRoute: `/${string}` }
): Promise<void> {
  const app = createApp();
  const router = createRouter();

  // Attach log ingest routes
  app.use(createLogIngestRoutes(store, opts.logsRoute));

  // Health
  router.get('/health', defineEventHandler(() => 'ok'));

  app.use(router);

  function configureNodeServer(srv: any) {
    try {
      srv.requestTimeout = 0;
      srv.headersTimeout = 0;
      typeof srv.setTimeout === 'function' && srv.setTimeout(0);
      srv.on('connection', (socket: any) => {
        try {
          socket.setKeepAlive?.(true, 60_000);
          socket.setNoDelay?.(true);
        } catch {}
      });
    } catch {}
  }

  function listenWithResult(srv: any, host: string, port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onListening = () => {
        try {
          const addr = srv.address();
          const actual = addr && typeof addr === 'object' && 'port' in addr ? (addr.port as number) : port;
          cleanup();
          resolve(actual);
        } catch (e) {
          cleanup();
          reject(e);
        }
      };
      const onError = (err: any) => { cleanup(); reject(err); };
      const cleanup = () => {
        try { srv.off?.('listening', onListening); } catch {}
        try { srv.off?.('error', onError); } catch {}
        try { srv.removeListener?.('listening', onListening); } catch {}
        try { srv.removeListener?.('error', onError); } catch {}
      };
      try {
        srv.once('listening', onListening);
        srv.once('error', onError);
        srv.listen(port, host);
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  }

  // Prefer requested port (usually 5179); fall back to ephemeral if it's taken
  let nodeServer = createNodeServer(toNodeListener(app));
  configureNodeServer(nodeServer);

  let actualPort: number;
  try {
    actualPort = await listenWithResult(nodeServer, opts.host, opts.port);
  } catch (err: any) {
    const isAddrInUse = err && (err.code === 'EADDRINUSE' || String(err.message || '').includes('EADDRINUSE'));
    if (isAddrInUse && opts.port !== 0) {
      try { nodeServer.close?.(); } catch {}
      nodeServer = createNodeServer(toNodeListener(app));
      configureNodeServer(nodeServer);
      actualPort = await listenWithResult(nodeServer, opts.host, 0);
    } else {
      throw err;
    }
  }

  // Write project-local config for providers
  writeProjectJson(opts.host, actualPort, opts.logsRoute);

  // eslint-disable-next-line no-console
  console.error(`Log ingest endpoint        → http://${opts.host}:${actualPort}${opts.logsRoute}`);
}

function writeProjectJson(host: string, port: number, route: `/${string}`) {
  try {
    const baseUrl = `http://${host}:${port}`;
    const payload = JSON.stringify({ url: baseUrl, route, timestamp: Date.now(), pid: typeof process !== 'undefined' ? process.pid : undefined });
    const file = joinPath(process.cwd(), '.browser-echo-mcp.json');
    const tmp = file + '.tmp';
    try { writeFileSync(tmp, payload); renameSync(tmp, file); }
    catch { try { writeFileSync(file, payload); } catch {} }
  } catch {}
}

/** Create log ingest routes that can be attached to any H3 app */
function createLogIngestRoutes(store: LogStore, logsRoute: `/${string}`) {
  const router = createRouter();
  const FILE_LOG_ENABLED = String(process.env.BROWSER_ECHO_FILE_LOG || '').toLowerCase() === 'true';
  const SPLIT_LOGS = String(process.env.BROWSER_ECHO_SPLIT_LOGS || '').toLowerCase() === 'true';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const FRONTEND_DIR = SPLIT_LOGS ? 'logs/frontend' : 'logs';
  const FRONTEND_FILE = joinPath(FRONTEND_DIR, `dev-${stamp}.log`);
  if (FILE_LOG_ENABLED) { try { mkdirSync(FRONTEND_DIR, { recursive: true }); } catch {} }

  // Log diagnostics (GET) → text/plain
  router.get(logsRoute, defineEventHandler(async (event) => {
    const q = getQuery(event) as { session?: string, tag?: '[browser]' | '[network]' | '[worker]' };
    let items = store.snapshot(q?.session ? String(q.session).slice(0, 8) : undefined);
    if (q?.tag) items = items.filter(e => (e.tag || '[browser]') === q.tag);
    const text = items.map((e) => {
      const sid = (e.sessionId || 'anon').slice(0, 8);
      const lvl = (e.level || 'log').toUpperCase();
      const tag = e.tag || '[browser]';
      let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
      if (e.source) line += ` (${e.source})`;
      if (e.stack && e.stack.trim().length) {
        const indented = e.stack.split(/\r?\n/g).map((l) => (l.length ? `    ${l}` : l)).join('\n');
        return `${line}\n${indented}`;
      }
      return line;
    }).join('\n');
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
      for (const entry of payload.entries as Array<{ level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; tag?: string; }>) {
        const level = normalizeLevel(entry.level);
        const entryOut = {
          sessionId: sid,
          level,
          text: String(entry.text ?? ''),
          time: entry.time,
          source: entry.source,
          stack: entry.stack,
          tag: entry.tag || '[browser]'
        } as const;
        store.append(entryOut);
        if (FILE_LOG_ENABLED) {
          const time = new Date().toISOString();
          let line = `${entryOut.tag} [${sid.slice(0,8)}] ${entryOut.level.toUpperCase()}: ${entryOut.text}`;
          if (entryOut.source) line += ` (${entryOut.source})`;
          const payload = [`[${time}] ${line}`];
          if (entryOut.stack && entryOut.stack.trim().length) {
            const indented = entryOut.stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
            payload.push(indented);
          }
          try { appendFileSync(FRONTEND_FILE, payload.join('\n') + '\n'); } catch {}
        }
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
