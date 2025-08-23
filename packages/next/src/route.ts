import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MCP_URL = (process.env.BROWSER_ECHO_MCP_URL || '').replace(/\/$/, '').replace(/\/mcp$/i, '');
const MCP_LOGS_ROUTE = process.env.BROWSER_ECHO_MCP_LOGS_ROUTE || '/__client-logs';

export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let payload: Payload | null = null;
  try { payload = (await req.json()) as Payload; }
  catch { return new NextResponse('invalid JSON', { status: 400 }); }
  if (!payload || !Array.isArray(payload.entries)) return new NextResponse('invalid payload', { status: 400 });

  // Resolve MCP URL: env (health-checked) → port 5179 (dev) → local discovery file (dev)
  let mcp = { url: '', token: '', routeLogs: '' as `/${string}` | '' } as { url: string; token?: string; routeLogs?: `/${string}` };
  if (MCP_URL) {
    if (await __pingHealth(`${MCP_URL}/health`, 300)) {
      mcp = { url: MCP_URL };
    }
  }
  if (!mcp.url && process.env.NODE_ENV === 'development') {
    for (const base of ['http://127.0.0.1:5179', 'http://localhost:5179']) {
      if (await __pingHealth(`${base}/health`, 300)) { mcp = { url: base }; break; }
    }
  }
  if (!mcp.url && process.env.NODE_ENV === 'development') {
    mcp = await __resolveMcpUrl();
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
  return new NextResponse(null, { status: 204 });
}

function norm(l: string): BrowserLogLevel {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log','info','warn','error','debug'] as const).includes(l as any) ? (l as BrowserLogLevel) : 'log';
}
function print(level: BrowserLogLevel, msg: string) {
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
function color(level: BrowserLogLevel, msg: string) {
  switch (level) {
    case 'error': return c.red + msg + c.reset;
    case 'warn':  return c.yellow + msg + c.reset;
    case 'debug': return c.magenta + msg + c.reset;
    case 'info':  return c.cyan + msg + c.reset;
    default:      return c.white + msg + c.reset;
  }
}
function dim(s: string) { return c.dim + s + c.reset; }

let __mcpDiscoveryCache: { url: string; token?: string; routeLogs?: `/${string}`; ts: number } | null = null;

async function __resolveMcpUrl(): Promise<{ url: string; token?: string; routeLogs?: `/${string}` }> {
  const now = Date.now();
  const CACHE_TTL_MS = 10_000;

  if (__mcpDiscoveryCache && (now - __mcpDiscoveryCache.ts) < CACHE_TTL_MS) {
    return { url: __mcpDiscoveryCache.url, token: __mcpDiscoveryCache.token, routeLogs: __mcpDiscoveryCache.routeLogs };
  }

  const fromFile = await __readDiscoveryFromFile();
  if (fromFile.url) {
    if (await __pingHealth(`${fromFile.url}/health`, 300)) {
      __mcpDiscoveryCache = { url: fromFile.url, token: fromFile.token, routeLogs: fromFile.routeLogs, ts: now };
      return fromFile;
    }
  }

  __mcpDiscoveryCache = { url: '', ts: now };
  return { url: '' };
}

async function __readDiscoveryFromFile(): Promise<{ url: string; token?: string; routeLogs?: `/${string}` }> {
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

async function __pingHealth(url: string, timeoutMs: number): Promise<boolean> {
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
