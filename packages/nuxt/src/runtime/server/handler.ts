import { defineEventHandler, readBody, setResponseStatus } from 'h3';

const MCP_URL = (process.env.BROWSER_ECHO_MCP_URL || '').replace(/\/$/, '').replace(/\/mcp$/i, '');
const MCP_LOGS_ROUTE = process.env.BROWSER_ECHO_MCP_LOGS_ROUTE || '/__client-logs';

type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: Level | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export default defineEventHandler(async (event) => {
  let payload: Payload | null = null;
  try { payload = (await readBody(event)) as Payload; }
  catch { setResponseStatus(event, 400); return 'invalid JSON'; }

  if (!payload || !Array.isArray(payload.entries)) {
    setResponseStatus(event, 400); return 'invalid payload';
  }

  // Resolve MCP URL: env var (if healthy) → port 5179 → local discovery file (dev only)
  let mcp = { url: '', token: '', routeLogs: '' as `/${string}` | '' } as { url: string; token?: string; routeLogs?: `/${string}` };
  if (MCP_URL) {
    if (await __pingHealthNuxt(`${MCP_URL}/health`, 300)) {
      mcp = { url: MCP_URL };
    }
  }
  if (!mcp.url && process.env.NODE_ENV === 'development') {
    // Try default port 5179 only in development
    const candidates = ['http://127.0.0.1:5179', 'http://localhost:5179'];
    for (const base of candidates) {
      if (await __pingHealthNuxt(`${base}/health`, 300)) { mcp = { url: base }; break; }
    }
  }
  if (!mcp.url && process.env.NODE_ENV === 'development') {
    mcp = await __resolveMcpUrlNuxt();
  }

  // Forward to MCP server if available (fire-and-forget)
  if (mcp.url) {
    try {
      const route = (MCP_LOGS_ROUTE as `/${string}`) || (mcp.routeLogs as `/${string}`) || '/__client-logs';
      const headers: Record<string,string> = { 'content-type': 'application/json' };
      if (mcp.token) headers['x-be-token'] = mcp.token;
      fetch(`${mcp.url}${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
        cache: 'no-store',
      }).catch(() => void 0);
    } catch {}
  }

  // Dynamically decide whether to print to terminal
  const envVal = process.env.BROWSER_ECHO_SUPPRESS_TERMINAL;
  const forceSuppress = envVal === '1';
  const forcePrint = envVal === '0';
  const shouldPrint = forcePrint ? true : (forceSuppress ? false : !mcp.url);

  const sid = (payload.sessionId ?? 'anon').slice(0, 8);
  for (const entry of payload.entries) {
    const level = norm(entry.level);
    let line = `[browser] [${sid}] ${level.toUpperCase()}: ${entry.text}`;
    if (entry.source) line += ` (${entry.source})`;
    if (shouldPrint) print(level, color(level, line));
    if (entry.stack && shouldPrint) print(level, dim(indent(entry.stack, '    ')));
  }

  setResponseStatus(event, 204);
  return '';
});

function norm(l: string): Level {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log','info','warn','error','debug'] as const).includes(l as any) ? (l as Level) : 'log';
}
function print(level: Level, msg: string) {
  switch (level) {
    case 'error': console.error(msg); break;
    case 'warn':  console.warn(msg); break;
    default:      console.log(msg);
  }
}
function indent(s: string, prefix = '  ') {
  return String(s).split(/\r?\n/g).map((l) => (l.length ? prefix + l : l)).join('\n');
}
const c = { reset:'\x1b[0m', red:'\x1b[31m', yellow:'\x1b[33m', magenta:'\x1b[35m', cyan:'\x1b[36m', white:'\x1b[37m', dim:'\x1b[2m' };
function color(level: Level, msg: string) {
  switch (level) {
    case 'error': return c.red + msg + c.reset;
    case 'warn':  return c.yellow + msg + c.reset;
    case 'debug': return c.magenta + msg + c.reset;
    case 'info':  return c.cyan + msg + c.reset;
    default:      return c.white + msg + c.reset;
  }
}
function dim(s: string) { return c.dim + s + c.reset; }

let __mcpDiscoveryCacheNuxt: { url: string; token?: string; routeLogs?: `/${string}`; ts: number } | null = null;

async function __resolveMcpUrlNuxt(): Promise<{ url: string; token?: string; routeLogs?: `/${string}` }> {
  const now = Date.now();
  const CACHE_TTL_MS = 10_000;

  if (__mcpDiscoveryCacheNuxt && (now - __mcpDiscoveryCacheNuxt.ts) < CACHE_TTL_MS) {
    return { url: __mcpDiscoveryCacheNuxt.url, token: __mcpDiscoveryCacheNuxt.token, routeLogs: __mcpDiscoveryCacheNuxt.routeLogs };
  }

  const fromFile = await __readDiscoveryFromFileNuxt();
  if (fromFile.url) {
    if (await __pingHealthNuxt(`${fromFile.url}/health`, 300)) {
      __mcpDiscoveryCacheNuxt = { url: fromFile.url, token: fromFile.token, routeLogs: fromFile.routeLogs, ts: now };
      return fromFile;
    }
  }

  __mcpDiscoveryCacheNuxt = { url: '', ts: now } as any;
  return { url: '' };
}

async function __readDiscoveryFromFileNuxt(): Promise<{ url: string; token?: string; routeLogs?: `/${string}` }> {
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    let dir = process.cwd();
    const root = dirname('/');
    while (true) {
      const p = join(dir, '.browser-echo-mcp.json');
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          const url = (data?.url ? String(data.url) : '').replace(/\/$/, '');
          const ts = typeof data?.timestamp === 'number' ? data.timestamp : 0;
          const token = data?.token ? String(data.token) : undefined;
          const routeLogs = data?.routeLogs ? String(data.routeLogs) as `/${string}` : undefined;
          if (url && (Date.now() - ts) < 60_000) return { url, token, routeLogs };
        } catch {}
      }
      const parent = dirname(dir);
      if (parent === dir || parent === root) break;
      dir = parent;
    }
  } catch {}
  return { url: '' };
}

async function __pingHealthNuxt(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' as any });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
