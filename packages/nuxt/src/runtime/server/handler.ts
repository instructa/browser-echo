import { defineEventHandler, readBody, setResponseStatus } from 'h3';

// Simplified: fixed single-server URL or env override

// Simplified: resolve MCP from project-local JSON once; no fallback

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

  // Fixed single-server: env or default localhost:5179
  const mcp = { url: (process.env.BROWSER_ECHO_MCP_URL || 'http://127.0.0.1:5179').replace(/\/$/, ''), routeLogs: '/__client-logs' } as const;

  // Forward to MCP server if available (fire-and-forget)
  if (mcp.url) {
    try {
      const route = (mcp.routeLogs as `/${string}`) || '/__client-logs';
      const headers: Record<string,string> = { 'content-type': 'application/json' };
      const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
      if (projectName) headers['X-Browser-Echo-Project-Name'] = projectName;
      fetch(`${mcp.url}${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
        cache: 'no-store',
      }).catch(() => void 0);
    } catch {}
  }

  // Suppress when forwarding active
  const shouldPrint = !mcp.url;

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
