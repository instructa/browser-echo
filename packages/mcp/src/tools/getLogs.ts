import type { McpToolContext } from '../types';
import { GetLogsSchema } from '../schemas/logs';
import { validateSessionId } from '../store';

export function registerGetLogsTool(ctx: McpToolContext) {
  const { mcp, store } = ctx;

  mcp.tool(
    'get_logs',
    'Fetch recent frontend browser console logs (errors/warnings/info). Use this when checking hydration errors, network failures, or React/Next warnings.',
    GetLogsSchema,
    async (args, _extra) => {
      // Ensure args is always an object to prevent destructuring issues
      const safeArgs = args || {} as any;
      const {
        level,
        session,
        includeStack = true,
        limit = 1000,
        contains,
        sinceMs
      } = safeArgs;

      const validSession = validateSessionId(session);
      const validSince = typeof sinceMs === 'number' && sinceMs >= 0 ? sinceMs : undefined;

      // Standardize: let store handle session filtering
      let items = store.snapshot(validSession);
      if (validSince) items = items.filter(e => !e.time || e.time >= validSince);
      if (level?.length) items = items.filter(e => level.includes(e.level));
      if (contains) items = items.filter(e => (e.text || '').includes(contains));
      const final = includeStack ? items : items.map(e => ({ ...e, stack: '' }));

      const limited = limit && final.length > limit ? final.slice(-limit) : final;

      const text = limited.map(e => {
        const sid = (e.sessionId || 'anon').slice(0, 8);
        const lvl = (e.level || 'log').toUpperCase();
        const tag = e.tag || '[browser]';
        let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
        if (e.source) line += ` (${e.source})`;
        if (includeStack && e.stack?.trim()) {
          const indented = e.stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
          return `${line}\n${indented}`;
        }
        return line;
      }).join('\n');

      return {
        content: [
          { type: 'text' as const, text }
        ]
      };
    }
  );
}