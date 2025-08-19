import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

// NOTE: We import from explicit ESM entrypoints per official SDK README.
// See: https://github.com/modelcontextprotocol/typescript-sdk
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  sessionId: string;
  level: BrowserLogLevel;
  text: string;
  time?: number;
  source?: string;
  stack?: string;
  tag?: string;
}

export interface StartOptions {
  /**
   * Displayed to MCP clients
   */
  name?: string;
  version?: string;
  /**
   * Max total entries kept in memory
   */
  bufferSize?: number;
}

const DEFAULT_BUFFER = 1000;

const GetLogsSchema = z.object({
  level: z.array(z.enum(['log', 'info', 'warn', 'error', 'debug'])).optional().describe('Filter by log levels'),
  session: z.string().optional().describe('8-char session id prefix'),
  includeStack: z.boolean().optional().default(true).describe('Include stack traces'),
  limit: z.number().int().min(1).max(5000).optional().describe('Maximum number of entries to return'),
  contains: z.string().optional().describe('Substring filter for log text'),
  sinceMs: z.number().nonnegative().optional().describe('Only entries with time >= sinceMs')
}).strict();

const ClearLogsSchema = z.object({
  session: z.string().optional().describe('8-char session id prefix to clear only one session'),
  scope: z.enum(['soft', 'hard']).optional().default('hard').describe('soft: set baseline marker (non-destructive), hard: delete entries (default)')
}).strict();

// ------------ In-memory log store (ring buffer) ------------
class LogStore {
  private entries: LogEntry[] = [];
  private max: number;
  private baselineTimestamps: Map<string, number> = new Map(); // For soft clear

  constructor(max = DEFAULT_BUFFER) {
    this.max = Math.max(50, max | 0);
  }

  setMax(max: number) {
    this.max = Math.max(50, max | 0);
    // Trim oldest entries if we exceeded the new max
    while (this.entries.length > this.max) this.entries.shift();
  }

  append(entry: LogEntry) {
    if (this.entries.length >= this.max) this.entries.shift();
    this.entries.push(entry);
  }

  clear(options?: { session?: string; scope?: 'soft' | 'hard' }) {
    const scope = options?.scope || 'hard';
    const session = options?.session;

    if (scope === 'soft') {
      // Set baseline timestamp for filtering
      const key = session || '__global__';
      this.baselineTimestamps.set(key, Date.now());
    } else {
      // Hard clear
      if (session) {
        // Clear only entries for specific session
        this.entries = this.entries.filter(e => (e.sessionId || '').slice(0, 8) !== session);
        // Remove any baseline for that session so future logs are visible
        this.baselineTimestamps.delete(session);
      } else {
        // Clear all entries
        this.entries.length = 0;
        // Remove all baselines (global and per-session)
        this.baselineTimestamps.clear();
      }
    }
  }

  toText(session?: string): string {
    // Render like terminal output but without ANSI
    return this.snapshot(session)
      .map((e) => {
        const sid = (e.sessionId || 'anon').slice(0, 8);
        const lvl = (e.level || 'log').toUpperCase();
        const tag = e.tag || '[browser]';
        let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
        if (e.source) line += ` (${e.source})`;
        if (e.stack && e.stack.trim().length) {
          // Indent stack
          const indented = e.stack.split(/\r?\n/g).map((l) => (l.length ? `    ${l}` : l)).join('\n');
          return `${line}\n${indented}`;
        }
        return line;
      })
      .join('\n');
  }

  snapshot(session?: string): LogEntry[] {
    let items = this.entries.slice();
    
    // Apply session filter if provided
    if (session) {
      items = items.filter(e => (e.sessionId || '').slice(0, 8) === session);
    }
    
    // Apply soft clear baseline filter
    const baselineKey = session || '__global__';
    const baseline = this.baselineTimestamps.get(baselineKey);
    if (baseline) {
      items = items.filter(e => !e.time || e.time >= baseline);
    }
    
    return items;
  }
}

const STORE = new LogStore();

// ------------ Validation helpers ------------
function validateSessionId(session?: string): string | undefined {
  if (!session) return undefined;
  // Ensure we have at least 1 char and max 8 chars for prefix matching
  const trimmed = String(session).trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, 8);
}

function validateTimestamp(sinceMs?: number): number | undefined {
  if (sinceMs === undefined || sinceMs === null) return undefined;
  const num = Number(sinceMs);
  if (isNaN(num) || num < 0) return undefined;
  // Don't allow timestamps too far in the future (1 hour)
  const maxFuture = Date.now() + 3600000;
  if (num > maxFuture) return maxFuture;
  return num;
}

// ------------ MCP server singletons ------------
let server: McpServer | null = null;
let transport: StreamableHTTPServerTransport | null = null;
let started = false;

// Optional standalone local HTTP server (used by Next's proxy)
let localHttpServer: import('node:http').Server | null = null;
let localUrl: string | null = null;

// ------------ Public API ------------
export function startMcpServer(opts: StartOptions = {}) {
  if (started && server && transport) return;

  // Respect dynamic buffer size without losing already buffered logs
  if (typeof opts.bufferSize === 'number' && opts.bufferSize > 0) {
    try { STORE.setMax(opts.bufferSize); } catch {}
  }

  server = new McpServer({
    name: opts.name ?? 'Browser Echo (Frontend Logs)',
    version: opts.version ?? '0.0.1'
  });

  // Register "browser-logs" static resource
  server.registerResource(
    'browser-logs',
    'browser-echo://logs',
    {
      title: 'Frontend Browser Console Logs',
      description: 'Recent frontend logs, console errors, warnings, React/Next hydration issues, network failures captured by Browser Echo',
      mimeType: 'text/plain'
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: STORE.toText()
          }
        ]
      };
    }
  );

  // Also expose a template to read a specific session (optional)
  server.registerResource(
    'browser-logs-session',
    new ResourceTemplate('browser-echo://logs/{session}', { list: undefined }),
    {
      title: 'Browser Console Logs (per session)',
      description: 'Console logs for a specific session ID',
      mimeType: 'text/plain'
    },
    async (uri, { session }) => {
      const sid = String(session || '').slice(0, 8);
      // Use snapshot with session to also honor soft baselines for that session
      const content = STORE.snapshot(sid)
        .map((e) => {
          const lvl = (e.level || 'log').toUpperCase();
          const tag = e.tag || '[browser]';
          let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
          if (e.source) line += ` (${e.source})`;
          if (e.stack && e.stack.trim().length) {
            const indented = e.stack.split(/\r?\n/g).map((l) => (l.length ? `    ${l}` : l)).join('\n');
            return `${line}\n${indented}`;
          }
          return line;
        })
        .join('\n');

      return {
        contents: [
          {
            uri: uri.href,
            text: content
          }
        ]
      };
    }
  );

  // Get logs tool - NLP entry point for fetching logs
  server.registerTool(
    'get_logs',
    {
      title: 'Get Frontend Browser Logs',
      description:
        'Fetch recent frontend browser console logs (errors/warnings/info). ' +
        'Use this when the user asks to check frontend logs, errors, hydration issues, or network failures.',
      inputSchema: GetLogsSchema
    },
    async (args: z.infer<typeof GetLogsSchema>) => {
      const {
        level,
        session,
        includeStack = true,
        limit = 1000,
        contains,
        sinceMs
      } = args ?? {};

      // Validate inputs (retain existing runtime guards for safety)
      const validSession = validateSessionId(session);
      const validSinceMs = validateTimestamp(sinceMs);

      let items = STORE.snapshot();

      // Apply filters
      if (validSinceMs) items = items.filter(e => !e.time || e.time >= validSinceMs);
      if (validSession) items = items.filter(e => (e.sessionId || '').slice(0, 8) === validSession);
      if (level?.length) items = items.filter(e => level.includes(e.level));
      if (contains) items = items.filter(e => (e.text || '').includes(contains));
      const finalItems = includeStack ? items : items.map(e => ({ ...e, stack: '' }));

      const limited = limit && finalItems.length > limit ? finalItems.slice(-limit) : finalItems;

      // Text view (like terminal but no ANSI)
      const text = limited.map(e => {
        const sid = (e.sessionId || 'anon').slice(0, 8);
        const lvl = (e.level || 'log').toUpperCase();
        const tag = e.tag || '[browser]';
        let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
        if (e.source) line += ` (${e.source})`;
        if (includeStack && e.stack?.trim()) {
          const indented = e.stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
          return `${line}\n${indented}`;
        }
        return line;
      }).join('\n');

      return {
        content: [
          { type: 'text', text },
          { type: 'json', json: { entries: limited } }
        ]
      };
    }
  );

  // Clear buffer tool with enhanced options
  server.registerTool(
    'clear_logs',
    {
      title: 'Clear Frontend Browser Logs',
      description: 'Clears the stored frontend browser console log buffer for fresh capture. Use this to start a clean capture before reproducing issues',
      inputSchema: ClearLogsSchema
    },
    async (args: z.infer<typeof ClearLogsSchema>) => {
      const { session, scope = 'hard' } = args ?? {};
      const validSession = validateSessionId(session);
      STORE.clear({ session: validSession, scope });

      let message = 'Browser log buffer ';
      if (scope === 'soft') {
        message += 'baseline set';
      } else {
        message += 'cleared';
      }
      if (validSession) {
        message += ` for session ${validSession}`;
      }
      message += '.';

      return { content: [{ type: 'text', text: message }] };
    }
  );

  // Create a single, stateful transport instance (session-aware)
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    // In local dev, DNS rebinding protection can be enabled by consumers if desired.
    // We keep it permissive by default to avoid blocking tools.
    enableDnsRebindingProtection: false
  });

  // Connect server to transport once
  void server.connect(transport);
  started = true;
}

export function getLogsAsText(session?: string): string {
  const sid = validateSessionId(session);
  return STORE.toText(sid);
}
export function getLogsSnapshot(session?: string): LogEntry[] {
  const sid = validateSessionId(session);
  return STORE.snapshot(sid);
}

/**
 * Handle an MCP HTTP request (Streamable HTTP transport) using Node's req/res.
 * Use this from frameworks that can expose Node req/res directly (Vite dev server, Nitro).
 */
export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body?: Buffer
): Promise<void> {
  if (!started || !server || !transport) startMcpServer();

  // CORS + expose session id per SDK guidance
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Allow both canonical and lowercase variants; include Accept & MCP-Protocol-Version for spec-compliant clients
    res.setHeader(
      'Access-Control-Allow-Headers',
      'content-type, accept, mcp-session-id, Mcp-Session-Id, mcp-protocol-version, MCP-Protocol-Version'
    );
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  } catch {}

  const method = String(req.method || '').toUpperCase();

  // Preflight
  if (method === 'OPTIONS') {
    if (!res.headersSent) res.statusCode = 204;
    res.end();
    return;
  }

  // Normalize the body for the SDK (expects an object, not a string or Buffer).
  // Accept Buffer|string|object from various runtimes (Vite/Next/Nuxt/local server).
  let payload: unknown = undefined;

  // If the caller passed a Buffer, attempt to parse it as JSON.
  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf-8');
    try {
      payload = JSON.parse(text);
    } catch {
      // If this was a POST/PUT/PATCH with invalid JSON, return a spec-compliant parse error.
      const m = String(req.method || '').toUpperCase();
      if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
        if (!res.headersSent) {
          res.statusCode = 400;
          try { res.setHeader('content-type', 'application/json'); } catch {}
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
        return;
      }
      // For non-body methods, just leave payload undefined.
      payload = undefined;
    }
  }
  // If some caller already parsed JSON and passed a string (older code paths), parse it now.
  else if (typeof (body as unknown) === 'string') {
    const text = body as unknown as string;
    try {
      payload = JSON.parse(text);
    } catch {
      const m = String(req.method || '').toUpperCase();
      if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
        if (!res.headersSent) {
          res.statusCode = 400;
          try { res.setHeader('content-type', 'application/json'); } catch {}
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
        return;
      }
      payload = undefined;
    }
  }
  // If an object-like was provided, pass it through unchanged.
  else if (body && typeof body === 'object') {
    payload = body as unknown;
  }
  // Else (no body provided), leave payload undefined and let the transport handle it.

  // For GET/DELETE: require a session id, otherwise respond with clear 405 (not "Session not found")
  if (method === 'GET' || method === 'DELETE') {
    const sidHeader = (req.headers['mcp-session-id'] as string | undefined) || '';
    if (!sidHeader) {
      if (!res.headersSent) {
        res.statusCode = 405;
        try {
          res.setHeader('Allow', 'POST');
          res.setHeader('content-type', 'application/json');
        } catch {}
      }
      // Make the guidance explicit: POST initialize → read Mcp-Session-Id → include for GET/DELETE (+ protocol header)
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed. To open a server stream, first POST an InitializeRequest to this MCP endpoint and read the Mcp-Session-Id response header. Include that Mcp-Session-Id (and MCP-Protocol-Version) on all subsequent GET/DELETE/POST requests.'
        },
        id: null
      }));
      return;
    }
  }

  await transport!.handleRequest(req as any, res as any, payload as any);
}

/**
 * Start an internal HTTP server bound to 127.0.0.1 for MCP traffic.
 * This is useful in environments like Next.js route handlers where Node req/res aren't exposed.
 */
export async function ensureLocalHttpServer(): Promise<void> {
  if (localHttpServer) return;

  startMcpServer();

  localHttpServer = createHttpServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        await new Promise<void>((resolve) => req.on('end', () => resolve()));
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      await handleMcpHttpRequest(req, res, body);
    } catch (err: any) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
      }
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        })
      );
    }
  });

  // --- NEW: Prevent SSE connections from being terminated by default Node timeouts ---
  try {
    // Disable per-request inactivity timeout (prevents ~2-5 min server-side termination across Node versions)
    // @ts-expect-error - requestTimeout exists on http.Server in Node, but TS may not include in some lib targets
    localHttpServer.requestTimeout = 0;

    // Disable header timeout to avoid premature close before stream fully established on slow environments
    // @ts-expect-error - headersTimeout exists on http.Server in Node
    localHttpServer.headersTimeout = 0;

    // Also set legacy/general socket timeout to 0 (no timeout)
    // @ts-expect-error - setTimeout on http.Server sets the socket timeout
    typeof localHttpServer.setTimeout === 'function' && localHttpServer.setTimeout(0);

    // Keep TCP connection alive to maintain long-lived SSE streams; send probes every 60s
    localHttpServer.on('connection', (socket: any) => {
      try {
        socket.setKeepAlive?.(true, 60_000);
        socket.setNoDelay?.(true);
      } catch {}
    });
  } catch {
    // Best-effort hardening; ignore if any of the props/methods are unavailable in the host Node
  }
  // -------------------------------------------------------------------------------

  await new Promise<void>((resolve, reject) => {
    localHttpServer!.listen(0, '127.0.0.1', () => resolve());
    localHttpServer!.once('error', reject);
  });

  const addr = localHttpServer.address();
  if (addr && typeof addr === 'object' && addr.address && addr.port) {
    localUrl = `http://${addr.address}:${addr.port}/mcp`;
  } else {
    // Fallback: root
    localUrl = 'http://127.0.0.1/';
  }
}

/** URL for the internal MCP HTTP endpoint started by ensureLocalHttpServer() */
export function getLocalMcpUrl(): string {
  // Default if ensureLocalHttpServer wasn't called yet.
  return localUrl || 'http://127.0.0.1/mcp';
}

/**
 * Append an entry to the in-memory buffer (used by framework log endpoints).
 * No-op if the server hasn't started yet; still fine, we buffer either way.
 */
export function publishLogEntry(entry: LogEntry): void {
  STORE.append(entry);
}

/** Simple flag to gate behavior in frameworks via env var (default enabled in dev). */
export function isMcpEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.BROWSER_ECHO_MCP !== '0';
}

// ------------- Express middleware for non-Vite Vue/React (optional) -------------
/**
 * Create a single middleware that wires:
 *   - POST /__client-logs  -> buffers logs, NO terminal printing (non-polluting)
 *   - GET  /__client-logs  -> returns current buffer as text/plain (diagnostics)
 *   - ANY  /__mcp          -> MCP HTTP transport entrypoint
 */
export function createBrowserEchoMiddleware(options?: {
  routeLogs?: `/${string}`;
  routeMcp?: `/${string}`;
  tag?: string;
}) {
  const routeLogs = options?.routeLogs ?? '/__client-logs';
  const routeMcp = options?.routeMcp ?? '/__mcp';
  const tag = options?.tag ?? '[browser]';

  startMcpServer();

  return async function browserEchoMiddleware(
    req: any,
    res: any,
    next: (err?: any) => void
  ) {
    const url = (req.path || req.url || '') as string;

    if (url.startsWith(routeMcp)) {
      try {
        const body =
          req.method === 'POST' && !req.body
            ? await new Promise<Buffer>((resolve, reject) => {
                const parts: Buffer[] = [];
                req.on('data', (c: any) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
                req.on('end', () => resolve(Buffer.concat(parts)));
                req.on('error', reject);
              })
            : undefined;
        await handleMcpHttpRequest(req, res, body);
      } catch (e) {
        next(e);
      }
      return;
    }

    if (url.startsWith(routeLogs) && req.method === 'GET') {
      try {
        const href = (req.originalUrl || req.url || '') as string;
        const u = new URL(href, 'http://localhost');
        const session = u.searchParams.get('session') || undefined;
        const text = getLogsAsText(session || undefined);
        res.statusCode = 200;
        try {
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
        } catch {}
        res.end(text);
      } catch (e) {
        res.statusCode = 500;
        res.end('error');
      }
      return;
    }

    if (url.startsWith(routeLogs) && req.method === 'POST') {
      try {
        const payload =
          req.body ||
          JSON.parse(
            (await new Promise<Buffer>((resolve, reject) => {
              const parts: Buffer[] = [];
              req.on('data', (c: any) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
              req.on('end', () => resolve(Buffer.concat(parts)));
              req.on('error', reject);
            })).toString('utf-8')
          );

        if (!payload || !Array.isArray(payload.entries)) {
          res.statusCode = 400;
          res.end('invalid payload');
          return;
        }
        const sid = String(payload.sessionId ?? 'anon');
        for (const entry of payload.entries as Array<{
          level: BrowserLogLevel | string;
          text: string;
          time?: number;
          stack?: string;
          source?: string;
        }>) {
          const level = normalizeLevel(entry.level);
          publishLogEntry({
            sessionId: sid,
            level,
            text: String(entry.text ?? ''),
            time: entry.time,
            source: entry.source,
            stack: entry.stack,
            tag
          });
        }
        res.statusCode = 204;
        res.end();
      } catch (e) {
        res.statusCode = 400;
        res.end('invalid JSON');
      }
      return;
    }

    next();
  };
}

function normalizeLevel(l: string): BrowserLogLevel {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log', 'info', 'warn', 'error', 'debug'] as const).includes(l as any)
    ? (l as BrowserLogLevel)
    : 'log';
}