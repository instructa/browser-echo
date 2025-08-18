import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

// NOTE: We import from explicit ESM entrypoints per official SDK README.
// See: https://github.com/modelcontextprotocol/typescript-sdk
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

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

// ------------ In-memory log store (ring buffer) ------------
class LogStore {
  private entries: LogEntry[] = [];
  private max: number;

  constructor(max = DEFAULT_BUFFER) {
    this.max = Math.max(50, max | 0);
  }

  append(entry: LogEntry) {
    if (this.entries.length >= this.max) this.entries.shift();
    this.entries.push(entry);
  }

  clear() {
    this.entries.length = 0;
  }

  toText(): string {
    // Render like terminal output but without ANSI
    return this.entries
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

  snapshot(): LogEntry[] {
    return this.entries.slice();
  }
}

const STORE = new LogStore();

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

  server = new McpServer({
    name: opts.name ?? 'browser-echo',
    version: opts.version ?? '0.0.1'
  });

  // Register "browser-logs" static resource
  server.registerResource(
    'browser-logs',
    'browser-echo://logs',
    {
      title: 'Browser Console Logs',
      description: 'Recent client-side console logs captured by Browser Echo',
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
      const content = STORE.snapshot()
        .filter((e) => (e.sessionId || '').slice(0, 8) === sid)
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

  // Clear buffer tool
  server.registerTool(
    'clear_logs',
    {
      title: 'Clear Browser Logs',
      description: 'Clears the stored browser console log buffer on the MCP server',
      inputSchema: {} as any
    },
    async () => {
      STORE.clear();
      return { content: [{ type: 'text', text: 'Browser log buffer cleared.' }] };
    }
  );

  // Create a single, stateful transport instance (session-aware)
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // In local dev, DNS rebinding protection can be enabled by consumers if desired.
    // We keep it permissive by default to avoid blocking tools.
    enableDnsRebindingProtection: false
  });

  // Connect server to transport once
  void server.connect(transport);
  started = true;
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

  // @ts-expect-error: SDK's transport has handleRequest(req,res,body)
  await transport!.handleRequest(req as any, res as any, body);
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