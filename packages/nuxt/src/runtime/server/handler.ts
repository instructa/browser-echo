import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { } from 'node:fs';
import { } from 'node:path';

let __probeStarted = false;
let __resolvedBase = '';
let __resolvedIngest = '';
let __isRemoteAvailable = false;
let __discoverySource: 'env' | 'fixed-port' = 'fixed-port';

function __normalizeBase(u: string): string { return String(u).trim().replace(/\/$/, '').replace(/\/mcp$/i, ''); }
function __computeDiscoveryOnce() {
  // 1) Explicit MCP URL via env
  const explicit = String(process.env.BROWSER_ECHO_MCP_URL || '').trim();
  if (explicit) {
    __resolvedBase = __normalizeBase(explicit);
    __resolvedIngest = `${__resolvedBase}/__client-logs`;
    __discoverySource = 'env';
    return;
  }
  // 2) Fixed port default
  const candidate = 'http://127.0.0.1:5179';
  __resolvedBase = candidate;
  __resolvedIngest = `${candidate}/__client-logs`;
  __discoverySource = 'fixed-port';
}

__computeDiscoveryOnce();
__isRemoteAvailable = !!__resolvedBase;

async function __probeHealthOnce(): Promise<boolean> {
  try {
    if (!__resolvedBase) return false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 400);
    const res = await fetch(`${__resolvedBase}/health`, { signal: ctrl.signal as any, cache: 'no-store' as any });
    clearTimeout(t);
    return !!res && res.ok;
  } catch { return false; }
}
function __startHealthProbe() {
  if (__probeStarted) return;
  __probeStarted = true;
  setInterval(async () => {
    if (!__resolvedBase) return;
    const ok = await __probeHealthOnce();
    if (ok) __isRemoteAvailable = true; else __isRemoteAvailable = false;
  }, 1500);
}
__startHealthProbe();

type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: Level | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

let __hasForwardedOnce = false;

export default defineEventHandler(async (event) => {
  let payload: Payload | null = null;
  try { payload = (await readBody(event)) as Payload; }
  catch { setResponseStatus(event, 400); return 'invalid JSON'; }

  if (!payload || !Array.isArray(payload.entries)) {
    setResponseStatus(event, 400); return 'invalid payload';
  }

  const baseUrl = __resolvedBase;
  const mcp = { url: baseUrl, routeLogs: '/__client-logs' } as const;

  // Forward to MCP server (fire-and-forget) and update connection state
  try {
    const route = (mcp.routeLogs as `/${string}`) || '/__client-logs';
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
    if (projectName) headers['X-Browser-Echo-Project-Name'] = projectName;
    // Stable per-dev-server id (nuxt dev instance)
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
      if (ok && ackOk) { __hasForwardedOnce = true; __isRemoteAvailable = true; }
      else { __isRemoteAvailable = false; }
    }).catch(() => { try { clearTimeout(timeout); } catch {} __isRemoteAvailable = false; });
  } catch {}

  // Suppress when MCP is available unless explicitly disabled via env
  const envSup = String(process.env.BROWSER_ECHO_SUPPRESS_TERMINAL ?? '').trim().toLowerCase();
  const envForce = envSup === '1' || envSup === 'true';
  const envDisable = envSup === '0' || envSup === 'false';
  const shouldSuppress = (envForce || (!envDisable /* default true in Nuxt */)) && __isRemoteAvailable && __hasForwardedOnce;
  const shouldPrint = !shouldSuppress;

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

// Stable per-Nuxt-dev-server id, generated once per process
let __nuxtDevInstanceId: string | null = null;
function getOrCreateDevId(): string {
  if (__nuxtDevInstanceId) return __nuxtDevInstanceId;
  try {
    const a = new Uint8Array(8);
    (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(a);
    __nuxtDevInstanceId = Array.from(a).map((b) => b.toString(16).padStart(2,'0')).join('');
  } catch {
    __nuxtDevInstanceId = String(Math.random()).slice(2, 10);
  }
  return __nuxtDevInstanceId;
}
