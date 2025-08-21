import type { McpToolContext } from '../types';
import { ClearLogsSchema } from '../schemas/logs';
import { validateSessionId } from '../store';

export function registerClearLogsTool(ctx: McpToolContext) {
  const { mcp, store } = ctx;

  mcp.tool(
    'clear_logs',
    'Clears the stored frontend browser console log buffer for fresh capture. Defaults to hard clear.',
    ClearLogsSchema,
    async (args, _extra) => {
      const safeArgs = args || {} as any;
      const { session, scope = 'hard' } = safeArgs;
      const validSession = validateSessionId(session);
      store.clear({ session: validSession, scope });

      let message = 'Browser log buffer ';
      message += scope === 'soft' ? 'baseline set' : 'cleared';
      if (validSession) message += ` for session ${validSession}`;
      message += '.';

      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}