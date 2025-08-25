import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MCP_BASE = (process.env.BROWSER_ECHO_MCP_URL || 'http://127.0.0.1:5179').replace(/\/$/, '').replace(/\/mcp$/i, '');
let __probeStarted = false;
async function __probeHealthOnce(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 400);
    const res = await fetch(`${MCP_BASE}/health`, { signal: ctrl.signal as any, cache: 'no-store' as any });
    clearTimeout(t);
    return !!res && res.ok;
  } catch { return false; }
}
function __startHealthProbe() {
  if (__probeStarted) return;
  __probeStarted = true;
  setInterval(async () => {
    if (__hasForwardedOnce) return;
    const ok = await __probeHealthOnce();
    if (ok) __hasForwardedOnce = true;
  }, 1500);
}
__startHealthProbe();

// Simplified: fixed single-server URL or env override

export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Module-scope: suppress only after first confirmed forward (any 2xx)
let __hasForwardedOnce = false;

export async function POST(req: NextRequest) {
  let payload: Payload | null = null;
  try { payload = (await req.json()) as Payload; }
  catch { return new NextResponse('invalid JSON', { status: 400 }); }
  if (!payload || !Array.isArray(payload.entries)) return new NextResponse('invalid payload', { status: 400 });

  const baseUrl = MCP_BASE;
  const mcp = { url: baseUrl, routeLogs: '/__client-logs' } as const;

  // Forward to MCP server (fire-and-forget) and update connection state
  try {
    const route = (mcp.routeLogs as `/${string}`) || '/__client-logs';
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
    if (projectName) headers['X-Browser-Echo-Project-Name'] = projectName;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 500);
    fetch(`${mcp.url}${route}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
      cache: 'no-store',
      signal: ctrl.signal as any,
    }).then((res) => { try { clearTimeout(timeout); } catch {} if (res && res.ok) __hasForwardedOnce = true; }).catch(() => { try { clearTimeout(timeout); } catch {} });
  } catch {}

  // Print locally until first confirmed forward; then suppress
  const shouldPrint = !__hasForwardedOnce;

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
