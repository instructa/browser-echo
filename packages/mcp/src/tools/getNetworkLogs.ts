import type { McpToolContext } from '../types';
import { GetNetworkLogsSchema } from '../schemas/logs';
import { validateSessionId } from '../store';

/**
 * Network logs are emitted by the client as console entries with payloads like:
 *   level: 'info' | 'error'
 *   text: `NET { ...json... }`
 * Where the JSON contains fields:
 *   kind: 'network', transport: 'fetch'|'xhr', method, url, status?, ok?, error?, ms
 */
export function registerGetNetworkLogsTool(ctx: McpToolContext) {
  const { mcp, store } = ctx;

  mcp.tool(
    'get_network_logs',
    'Fetch recent network activity captured via fetch/XHR interception.',
    GetNetworkLogsSchema,
    async (args, _extra) => {
      const safe = args || {} as any;
      const {
        session,
        project,
        method,
        statusMin,
        statusMax,
        urlContains,
        errorsOnly = false,
        limit = 1000,
        sinceMs
      } = safe as typeof GetNetworkLogsSchema['_output'];

      const validSession = validateSessionId(session);
      const items = store.snapshot(validSession);

      // Parse entries that match the network format
      const parsed = [] as Array<{
        time?: number;
        project?: string;
        sessionId?: string;
        level: string;
        raw: string;
        data: {
          kind?: string;
          transport?: string;
          method?: string;
          url?: string;
          status?: number;
          ok?: boolean;
          error?: string;
          ms?: number;
        };
      }>;

      for (const e of items) {
        if (sinceMs && e.time && e.time < sinceMs) continue;
        if (project && (e.project || '') !== project) continue;
        const text = String(e.text || '');
        if (!text.startsWith('NET ')) continue;
        const jsonPart = text.slice(4).trim();
        try {
          const obj = JSON.parse(jsonPart);
          if (!obj || obj.kind !== 'network') continue;
          parsed.push({
            time: e.time,
            project: e.project,
            sessionId: e.sessionId,
            level: e.level,
            raw: text,
            data: {
              kind: obj.kind,
              transport: obj.transport,
              method: obj.method,
              url: obj.url,
              status: typeof obj.status === 'number' ? obj.status : undefined,
              ok: typeof obj.ok === 'boolean' ? obj.ok : undefined,
              error: typeof obj.error === 'string' ? obj.error : undefined,
              ms: typeof obj.ms === 'number' ? obj.ms : undefined
            }
          });
        } catch {
          // ignore malformed
        }
      }

      // Apply filters
      let filtered = parsed;
      if (errorsOnly) filtered = filtered.filter(x => x.level === 'error' || !!x.data.error || (typeof x.data.status === 'number' && (x.data.status < 200 || x.data.status >= 400)));
      if (method && method.length) {
        const mset = new Set(method.map(m => m.toUpperCase()));
        filtered = filtered.filter(x => (x.data.method || '').toUpperCase() && mset.has((x.data.method || '').toUpperCase()));
      }
      if (typeof statusMin === 'number') filtered = filtered.filter(x => typeof x.data.status === 'number' ? x.data.status >= statusMin : true);
      if (typeof statusMax === 'number') filtered = filtered.filter(x => typeof x.data.status === 'number' ? x.data.status <= statusMax : true);
      if (urlContains) filtered = filtered.filter(x => (x.data.url || '').includes(urlContains));

      // Limit
      if (limit && filtered.length > limit) filtered = filtered.slice(-limit);

      if (!filtered.length) {
        return { content: [{ type: 'text' as const, text: 'No network logs found.' }] };
      }

      const lines = filtered.map(x => {
        const t = x.time ? new Date(x.time).toISOString() : '';
        const sid = (x.sessionId || 'anon').slice(0, 8);
        const p = x.project ? `[${x.project}] ` : '';
        const meth = (x.data.method || '').toUpperCase();
        const stat = typeof x.data.status === 'number' ? ` ${x.data.status}` : (x.data.error ? ' ERR' : '');
        const ms = typeof x.data.ms === 'number' ? ` ${x.data.ms}ms` : '';
        return `${p}[net] [${sid}] ${meth} ${x.data.url || ''}${stat}${ms}${t ? ` @ ${t}` : ''}`.trim();
      }).join('\n');

      return { content: [{ type: 'text' as const, text: lines }] };
    }
  );
}


