import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { publishLogEntry, isMcpEnabled as _mcpEnvEnabled, startMcpServer, getLogsAsText } from '@browser-echo/mcp';

type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: Level | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export default defineEventHandler(async (event) => {
  try { startMcpServer(); } catch (e) { console.error('[browser-echo] MCP server failed to start:', e); }
  const mcpOn = _mcpEnvEnabled();

  const method = String(event.node?.req?.method || 'POST').toUpperCase();
  if (method === 'GET') {
    try {
      const href = event.node?.req?.url || '/__client-logs';
      const u = new URL(href, 'http://localhost');
      const session = u.searchParams.get('session') || undefined;
      const text = getLogsAsText(session || undefined);
      try {
        event.node.res.setHeader('content-type', 'text/plain; charset=utf-8');
        event.node.res.setHeader('cache-control', 'no-store');
      } catch {}
      setResponseStatus(event, 200);
      return text;
    } catch {
      setResponseStatus(event, 500);
      return 'error';
    }
  }

  let payload: Payload | null = null;
  try { payload = (await readBody(event)) as Payload; }
  catch { setResponseStatus(event, 400); return 'invalid JSON'; }

  if (!payload || !Array.isArray(payload.entries)) {
    setResponseStatus(event, 400); return 'invalid payload';
  }

  const sid = (payload.sessionId ?? 'anon').slice(0, 8);
  for (const entry of payload.entries) {
    const level = norm(entry.level);
    let line = `[browser] [${sid}] ${level.toUpperCase()}: ${entry.text}`;
    if (entry.source) line += ` (${entry.source})`;

    publishLogEntry({
      sessionId: payload.sessionId ?? 'anon',
      level,
      text: String(entry.text ?? ''),
      time: entry.time,
      source: entry.source,
      stack: entry.stack,
      tag: '[browser]'
    });

    if (!mcpOn) {
      print(level, color(level, line));
      if (entry.stack) print(level, dim(indent(entry.stack, '    ')));
    }
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
