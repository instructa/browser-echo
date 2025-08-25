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
      const { session, scope = 'hard', project } = safeArgs as typeof ClearLogsSchema['_output'];
      const validSession = validateSessionId(session);
      if (project) {
        // Project-scoped hard clear by filtering entries not matching the project
        // For soft clear, set baseline without deleting
        if (scope === 'soft') {
          // Use global baseline for project-scoped soft clear by current time; retrieval filters by project
          // This keeps implementation simple while honoring freshness for the project
          store.clear({ scope: 'soft' });
        } else {
          // Rebuild entries array excluding the project. Since entries is private, leverage snapshot and re-append
          const remaining = store.snapshot().filter(e => (e.project || '') !== project);
          // Replace internal state: simulate with hard clear then re-append
          store.clear({ scope: 'hard' });
          for (const e of remaining) store.append(e);
        }
      } else {
        store.clear({ session: validSession, scope });
      }

      let message = 'Browser log buffer ';
      message += scope === 'soft' ? 'baseline set' : 'cleared';
      if (project) message += ` for project ${project}`;
      else if (validSession) message += ` for session ${validSession}`;
      message += '.';

      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}