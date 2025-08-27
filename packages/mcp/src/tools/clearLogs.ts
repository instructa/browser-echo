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
      const { session, project } = safeArgs as typeof ClearLogsSchema['_output'];
      const validSession = validateSessionId(session);

      // If this instance is not the ingest owner but a global ingest exists, proxy via HTTP by posting a special clear payload
      const ingestBase = (process.env.BROWSER_ECHO_INGEST_BASE || '').replace(/\/$/, '');
      const logsRoute = process.env.BROWSER_ECHO_LOGS_ROUTE || '/__client-logs';
      const ingestOwner = String(process.env.BROWSER_ECHO_INGEST_OWNER || '1') === '1';
      if (!ingestOwner && ingestBase) {
        try {
          const payload = { sessionId: validSession || 'anon', entries: [{ level: 'debug', text: '__BROWSER_ECHO_CLEAR__', time: Date.now(), source: project ? `project:${project}` : undefined }] };
          await fetch(`${ingestBase}${logsRoute}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
          const msg = 'Browser log buffer clear requested via global ingest.' + (project ? ` for project ${project}.` : validSession ? ` for session ${validSession}.` : '');
          return { content: [{ type: 'text' as const, text: msg }] };
        } catch {
          // fall through to local clear
        }
      }

      store.clear({ session: validSession, scope: 'hard', project });

      let message = 'Browser log buffer cleared';
      if (project) message += ` for project ${project}`;
      else if (validSession) message += ` for session ${validSession}`;
      message += '.';

      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}