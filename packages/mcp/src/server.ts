import { createServer as createNodeServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { createApp, createRouter, defineEventHandler, getQuery, readRawBody, setResponseStatus, toNodeListener } from 'h3';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // Debug context: where and how this MCP server is started
  const __debugEnabled = (() => {
    try {
      const v = String(process.env.BROWSER_ECHO_DEBUG ?? '').trim().toLowerCase();
      return v !== '' && v !== '0' && v !== 'false';
    } catch { return false; }
  })();

  if (__debugEnabled) {
    try {
      const envSnapshot: Record<string, string> = {};
      for (const k of Object.keys(process.env)) {
        if (k.startsWith('BROWSER_ECHO_') || k === 'NODE_ENV') {
          const val = process.env[k];
          envSnapshot[k] = typeof val === 'string' ? val : '';
        }
      }
      const transport = options.type;
      const host = transport === 'http' ? options.host : (options.host || '127.0.0.1');
      const port = transport === 'http'
        ? (options as any).port
        : (() => {
            const envIngest = process.env.BROWSER_ECHO_INGEST_PORT;
            const preferred = ((options as any).port ?? (envIngest ? (Number(envIngest) | 0) : 5179)) | 0;
            return preferred > 0 ? preferred : 5179;
          })();
      const route = transport === 'http' ? (options as any).logsRoute : ((options as any).logsRoute || '/__client-logs');
      // eslint-disable-next-line no-console
      console.error(`[MCP debug] pid=${process.pid} cwd=${process.cwd()} transport=${transport} host=${host} port=${port} route=${route}`);
      // eslint-disable-next-line no-console
      console.error(`[MCP debug] env: ${JSON.stringify(envSnapshot)}`);
    } catch {}
  }
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
  async function tryFetch(url: string, init: any = {}, timeoutMs = 400): Promise<{ ok: boolean; status: number; text?: string }> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { ...(init || {}), signal: ctrl.signal as any, cache: 'no-store' as any });
      clearTimeout(t);
      let body: string | undefined;
      try { body = await res.text(); } catch {}
      return { ok: !!res.ok, status: res.status, text: body };
    } catch {
      return { ok: false, status: 0 } as any;
    }
  }

  async function isExistingHttpMcp(base: string, endpoint: `/${string}`): Promise<boolean> {
    const health = await tryFetch(`${base}/health`);
    if (!health.ok) return false;
    // Probe MCP endpoint: GET without session should respond 405 with JSON error
    const probe = await tryFetch(`${base}${endpoint}`, { method: 'GET' });
    if (probe.status === 405 && (probe.text || '').includes('Method not allowed')) return true;
    // Some servers may not expose GET; try OPTIONS as a weak signal
    const opt = await tryFetch(`${base}${endpoint}`, { method: 'OPTIONS' });
    return opt.status === 204 || opt.status === 200;
  }

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

  // Attempt to listen on the requested port (fail fast if already in use)
  try {
    await new Promise<void>((resolve, reject) => {
      nodeServer.listen(opts.port, opts.host, () => resolve());
      nodeServer.on('error', reject);
    });
  } catch (err: any) {
    const isAddrInUse = err && (err.code === 'EADDRINUSE' || String(err.message || '').includes('EADDRINUSE'));
    if (isAddrInUse) {
      const base = `http://${opts.host}:${opts.port}`;
      const reuse = await isExistingHttpMcp(base, opts.endpoint);
      if (reuse) {
        // eslint-disable-next-line no-console
        console.error(`Existing MCP server detected at ${base}. Reusing it without starting a new instance.`);
        return; // Treat as successful startup (server already available)
      }
      const errorMsg = [
        `Failed to start MCP server: Port ${opts.port} is already in use by a non-MCP service.`,
        `Either stop that service or choose a different port with --port.`,
      ].join('\n');
      console.error(errorMsg);
      process.exit(1);
    }
    throw err;
  }

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

  // Prefer requested port (usually 5179); do not fall back (single-server mode)
  let nodeServer = createNodeServer(toNodeListener(app));
  configureNodeServer(nodeServer);

  let actualPort: number;
  try {
    actualPort = await listenWithResult(nodeServer, opts.host, opts.port);
  } catch (err: any) {
    const isAddrInUse = err && (err.code === 'EADDRINUSE' || String(err.message || '').includes('EADDRINUSE'));
          if (isAddrInUse) {
        const base = `http://${opts.host}:${opts.port}`;
        // If an ingest server already responds to /health, reuse it silently
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 400);
          const res = await fetch(`${base}/health`, { signal: ctrl.signal as any, cache: 'no-store' as any });
          clearTimeout(t);
          if (res && res.ok) {
            // eslint-disable-next-line no-console
            console.error(`Ingest server already running at ${base}${opts.logsRoute}. Reusing existing instance.`);
            // Expose discovery for non-owner instances
            try {
              process.env.BROWSER_ECHO_INGEST_BASE = base;
              process.env.BROWSER_ECHO_LOGS_ROUTE = String(opts.logsRoute);
              process.env.BROWSER_ECHO_INGEST_OWNER = '0';
            } catch {}
            return; // Treat as success
          }
        } catch {}
      // eslint-disable-next-line no-console
      console.error(`Failed to start ingest-only server: Port in use at ${base}${opts.logsRoute}`);
    }
    throw err;
  }

  // eslint-disable-next-line no-console
  console.error(`Log ingest endpoint        → http://${opts.host}:${actualPort}${opts.logsRoute}`);
}

// Removed project JSON discovery in single-server mode

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
      const __dbg = String(process.env.BROWSER_ECHO_DEBUG || '').trim().toLowerCase();
      const __debug = __dbg !== '' && __dbg !== '0' && __dbg !== 'false';
      if (__debug) {
        try {
          const hdrs = event.node.req.headers || {} as any;
          // eslint-disable-next-line no-console
          console.error('[MCP ingest debug] headers:', JSON.stringify(hdrs));
        } catch {}
      }
      const raw = await readRawBody(event);
      const payload = typeof raw === 'string' ? JSON.parse(raw) : (raw ? JSON.parse(Buffer.from(raw as any).toString('utf-8')) : undefined);
      if (!payload || !Array.isArray(payload.entries)) {
        setResponseStatus(event, 400);
        return 'invalid payload';
      }
      const sid = String(payload.sessionId ?? 'anon');
      // Extract optional project metadata from headers
      const hdrs = event.node.req.headers;
      const projectHeader = (hdrs['x-browser-echo-project-name'] || hdrs['x-project-name'] || hdrs['x-project'] || '') as string | string[] | undefined;
      const projectName = Array.isArray(projectHeader) ? String(projectHeader[0] || '') : String(projectHeader || '');
      // Extract dev id for ACK handshake
      const devIdHeader = (hdrs['x-browser-echo-dev-id'] || hdrs['x-dev-id'] || '') as string | string[] | undefined;
      const devId = Array.isArray(devIdHeader) ? String(devIdHeader[0] || '') : String(devIdHeader || '');
      if (__debug) {
        try {
          // eslint-disable-next-line no-console
          console.error(`[MCP ingest debug] session=${sid} project=${projectName} devId=${devId} entries=${payload.entries.length}`);
        } catch {}
      }
      // Special command: remote clear request
      const isClear = payload.entries.length === 1 && String(payload.entries[0]?.text || '') === '__BROWSER_ECHO_CLEAR__';
      if (isClear) {
        store.clear({ session: sid ? String(sid).slice(0,8) : undefined, scope: 'hard', project: projectName || undefined });
        try { event.node.res.setHeader('X-Browser-Echo-Ack', `project=${projectName || ''};devId=${devId || ''}`); } catch {}
        setResponseStatus(event, 204);
        return '';
      }
      for (const entry of payload.entries as Array<{ level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; }>) {
        const level = normalizeLevel(entry.level);
        store.append({
          sessionId: sid,
          level,
          text: String(entry.text ?? ''),
          time: entry.time,
          source: entry.source,
          stack: entry.stack,
          tag: '[browser]',
          project: projectName ? projectName : undefined
        });
      }
      // Mark this instance as the ingest owner so clients can distinguish our server from stray ones
      try { event.node.res.setHeader('X-Browser-Echo-Ack', `project=${projectName || ''};devId=${devId || ''};owner=1`); } catch {}
      // Mark this instance as the ingest owner so clients can distinguish our server from stray ones
      try { event.node.res.setHeader('X-Browser-Echo-Ack', `project=${projectName || ''};devId=${devId || ''};owner=1`); } catch {}
      setResponseStatus(event, 204);
      return '';
    } catch {
      setResponseStatus(event, 400);
      return 'invalid JSON';
    }
  }));

  return router;
}
