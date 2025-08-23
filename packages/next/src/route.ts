import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Simplified: resolve MCP from project-local JSON once; no fallback

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

  // Resolve MCP once: project JSON only (no fallback)
  const mcp = await __resolveMcpFromProject();

  // Forward to MCP server if available (fire-and-forget)
  if (mcp.url) {
    try {
      const route = (mcp.routeLogs as `/${string}`) || '/__client-logs';
      const headers: Record<string,string> = { 'content-type': 'application/json' };
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
  const shouldPrint = !mcp.url;

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

let __mcpProjectCache: { url: string; routeLogs?: `/${string}` } | null = null;

async function __resolveMcpFromProject(): Promise<{ url: string; routeLogs?: `/${string}` }> {
  // Only cache positive resolutions; always retry if unresolved/empty
  if (__mcpProjectCache && __mcpProjectCache.url) return __mcpProjectCache;
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const p = join(process.cwd(), '.browser-echo-mcp.json');
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf-8');
      const data = JSON.parse(raw);
      const rawUrl = (data?.url ? String(data.url) : '');
      const url = rawUrl.replace(/\/$/, '').replace(/\/mcp$/i, '');
      const routeLogs = (data?.route ? String(data.route) : '/__client-logs') as `/${string}`;
      if (url && await __pingHealth(`${url}/health`, 250)) {
        __mcpProjectCache = { url, routeLogs };
        return __mcpProjectCache;
      }
    }
  } catch {}
  __mcpProjectCache = { url: '' } as any;
  return __mcpProjectCache;
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
