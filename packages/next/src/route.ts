import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MCP_URL = (process.env.BROWSER_ECHO_MCP_URL || '').replace(/\/$/, '');
const MCP_LOGS_ROUTE = process.env.BROWSER_ECHO_MCP_LOGS_ROUTE || '/__client-logs';
const SUPPRESS_TERMINAL = MCP_URL && process.env.BROWSER_ECHO_SUPPRESS_TERMINAL !== '0';

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

  // Resolve MCP URL: env var has priority, otherwise discover in development
  const mcpUrl = MCP_URL || (process.env.NODE_ENV === 'development' ? await __resolveMcpUrl() : '');

  // Forward to MCP server if available (fire-and-forget)
  if (mcpUrl) {
    try {
      fetch(`${mcpUrl}${MCP_LOGS_ROUTE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        cache: 'no-store',
      }).catch(() => void 0);
    } catch {}
  }

  // Dynamically decide whether to print to terminal
  const shouldPrint = !(mcpUrl && process.env.BROWSER_ECHO_SUPPRESS_TERMINAL !== '0');

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

let __mcpDiscoveryCache: { url: string; ts: number } | null = null;

async function __resolveMcpUrl(): Promise<string> {
  // 1) Env var already handled by caller; only discover in dev here.
  const now = Date.now();
  const CACHE_TTL_MS = 30_000;

  // Use fresh cache if present
  if (__mcpDiscoveryCache && (now - __mcpDiscoveryCache.ts) < CACHE_TTL_MS) {
    return __mcpDiscoveryCache.url;
  }

  // 2) Discovery file (project root or OS tmp)
  const fromFile = await __readDiscoveryUrlFromFile();
  if (fromFile) {
    __mcpDiscoveryCache = { url: fromFile, ts: now };
    return fromFile;
  }

  // 3) Port scan common local ports
  const ports = [5179, 5178, 3001, 4000, 5173];
  for (const port of ports) {
    const bases = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    for (const base of bases) {
      if (await __pingHealth(`${base}/health`, 400)) {
        __mcpDiscoveryCache = { url: base, ts: now };
        return base;
      }
    }
  }

  __mcpDiscoveryCache = { url: '', ts: now };
  return '';
}

async function __readDiscoveryUrlFromFile(): Promise<string> {
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const candidates = [
      join(process.cwd(), '.browser-echo-mcp.json'),
      join(tmpdir(), 'browser-echo-mcp.json')
    ];
    for (const p of candidates) {
      try {
        if (!existsSync(p)) continue;
        const raw = readFileSync(p, 'utf-8');
        const data = JSON.parse(raw);
        const url = (data?.url ? String(data.url) : '').replace(/\/$/, '');
        const ts = typeof data?.timestamp === 'number' ? data.timestamp : 0;
        // Treat as fresh if updated within the last 60s
        if (url && (Date.now() - ts) < 60_000) return url;
      } catch {}
    }
  } catch {}
  return '';
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
