import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MCP_BASE = (process.env.BROWSER_ECHO_MCP_URL || 'http://127.0.0.1:5179').replace(/\/$/, '').replace(/\/mcp$/i, '');
// Fixed single-server URL or env override; suppression relies on ACK, not health probes

export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Module-scope: track MCP availability via ACK; unsuppress on failures
let __isRemoteAvailable = false;
let __nextDevInstanceId: string | null = null;
function getOrCreateDevId(): string {
  if (__nextDevInstanceId) return __nextDevInstanceId;
  try {
    // @ts-ignore: webcrypto may exist in Node 20+
    const wc = (globalThis as any).crypto?.getRandomValues ? (globalThis as any).crypto : require('node:crypto').webcrypto;
    const a = new Uint8Array(8);
    wc.getRandomValues(a);
    __nextDevInstanceId = Array.from(a).map((b) => b.toString(16).padStart(2,'0')).join('');
  } catch {
    __nextDevInstanceId = String(Math.random()).slice(2, 10);
  }
  return __nextDevInstanceId;
}

export async function POST(req: NextRequest) {
  let payload: Payload | null = null;
  try { payload = (await req.json()) as Payload; }
  catch { return new NextResponse('invalid JSON', { status: 400 }); }
  if (!payload || !Array.isArray(payload.entries)) return new NextResponse('invalid payload', { status: 400 });

  const baseUrl = MCP_BASE;
  const mcp = { url: baseUrl, routeLogs: '/__client-logs' } as const;

  // Forward to MCP server (fire-and-forget) and update availability based on ACK
  try {
    const route = (mcp.routeLogs as `/${string}`) || '/__client-logs';
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
    if (projectName) headers['X-Browser-Echo-Project-Name'] = projectName;
    const devId = getOrCreateDevId();
    headers['X-Browser-Echo-Dev-Id'] = devId;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 500);

    fetch(`${mcp.url}${route}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
      cache: 'no-store',
      signal: ctrl.signal as any,
    }).then((res) => {
      try { clearTimeout(timeout); } catch {}
      const ok = !!res && res.ok;
      let ackOk = false;
      try {
        const ack = (res as any).headers?.get?.('X-Browser-Echo-Ack') || '';
        if (ack) {
          const mProject = /project=([^;]*)/i.exec(ack);
          const mDev = /devId=([^;]*)/i.exec(ack);
          const mOwner = /owner=([^;]*)/i.exec(ack);
          const aProject = mProject ? decodeURIComponent(mProject[1]) : '';
          const aDev = mDev ? decodeURIComponent(mDev[1]) : '';
          const isOwner = (mOwner ? String(mOwner[1]) : '') === '1';
          ackOk = (!projectName || aProject === projectName) && aDev === devId && isOwner;
        }
      } catch {}
      if (ok && ackOk) {
        __isRemoteAvailable = true;
      } else {
        __isRemoteAvailable = false;
      }
    }).catch(() => {
      try { clearTimeout(timeout); } catch {}
      __isRemoteAvailable = false;
    });
  } catch {}

  // Terminal printing policy for Next route:
  // - Default: ALWAYS print locally
  // - If BROWSER_ECHO_SUPPRESS_TERMINAL=1|true, suppress when remote ingest is confirmed available
  // - If BROWSER_ECHO_SUPPRESS_TERMINAL=0|false, always print
  const envSup = String(process.env.BROWSER_ECHO_SUPPRESS_TERMINAL ?? '').trim().toLowerCase();
  const envForceSuppress = envSup === '1' || envSup === 'true';
  const envForcePrint = envSup === '0' || envSup === 'false';
  let shouldPrint = true;
  if (envForcePrint) {
    shouldPrint = true;
  } else if (envForceSuppress) {
    shouldPrint = !__isRemoteAvailable;
  }

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
