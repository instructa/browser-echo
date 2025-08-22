import { defineEventHandler, readBody, setResponseStatus } from 'h3';

const MCP_URL = (process.env.BROWSER_ECHO_MCP_URL || '').replace(/\/$/, '');
const MCP_LOGS_ROUTE = process.env.BROWSER_ECHO_MCP_LOGS_ROUTE || '/__client-logs';
const SUPPRESS_TERMINAL = MCP_URL && process.env.BROWSER_ECHO_SUPPRESS_TERMINAL !== '0';

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

  // Resolve MCP URL: env var first, otherwise discover in development
  const mcp = MCP_URL ? { url: MCP_URL, token: '' } : (process.env.NODE_ENV === 'development' ? await __resolveMcpUrlNuxt() : { url: '', token: '' });

  // Forward to MCP server if available (fire-and-forget)
  if (mcp.url) {
    try {
      fetch(`${mcp.url}${MCP_LOGS_ROUTE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        cache: 'no-store',
      }).catch(() => void 0);
    } catch {}
  }

  // Dynamically decide whether to print to terminal
  const shouldPrint = !(mcp.url && process.env.BROWSER_ECHO_SUPPRESS_TERMINAL !== '0');

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

let __mcpDiscoveryCacheNuxt: { url: string; token?: string; ts: number } | null = null;

async function __resolveMcpUrlNuxt(): Promise<{ url: string; token?: string }> {
  const now = Date.now();
  const CACHE_TTL_MS = 30_000;

  if (__mcpDiscoveryCacheNuxt && (now - __mcpDiscoveryCacheNuxt.ts) < CACHE_TTL_MS) {
    return { url: __mcpDiscoveryCacheNuxt.url, token: __mcpDiscoveryCacheNuxt.token };
  }

  const fromFile = await __readDiscoveryFromFileNuxt();
  if (fromFile.url) {
    if (await __pingHealthNuxt(`${fromFile.url}/health`, 300)) {
      __mcpDiscoveryCacheNuxt = { url: fromFile.url, token: fromFile.token, ts: now };
      return fromFile;
    }
    // purge stale tmp discovery
    try {
      const { unlinkSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const stale = join(tmpdir(), 'browser-echo-mcp.json');
      if (existsSync(stale)) unlinkSync(stale);
    } catch {}
  }

  const ports = [5179, 5178, 3001, 4000, 5173];
  for (const port of ports) {
    const bases = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    for (const base of bases) {
      if (await __pingHealthNuxt(`${base}/health`, 400)) {
        __mcpDiscoveryCacheNuxt = { url: base, ts: now };
        return { url: base };
      }
    }
  }

  __mcpDiscoveryCacheNuxt = { url: '', ts: now };
  return { url: '' };
}

async function __readDiscoveryFromFileNuxt(): Promise<{ url: string; token?: string }> {
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
        const token = data?.token ? String(data.token) : undefined;
        if (url && (Date.now() - ts) < 60_000) return { url, token };
      } catch {}
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
