import type { McpToolContext } from '../types';
import { ClearLogsSchema } from '../schemas/logs';
import { validateSessionId } from '../store';
import { rotate } from '../file-store';
import { promises as fsp } from 'node:fs';
import { dirname, join as joinPath } from 'node:path';

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

      const baseDir = (process.env.BROWSER_ECHO_DIR || '.browser-echo').trim() || '.browser-echo';
      const activeFile = await resolveActiveLogFile(baseDir);
      if (activeFile) {
        try {
          const rotated = await rotate(activeFile);
          const suffix = project ? ` (project filter ignored in file mode)` : '';
          return { content: [{ type: 'text' as const, text: `Rotated Browser Echo log file → ${rotated}${suffix}` }] };
        } catch (e) {
          // fall through to memory clear
        }
      }

      // In-memory fallback
      store.clear({ session: validSession, scope: 'hard', project });

      let message = 'Browser log buffer cleared';
      if (project) message += ` for project ${project}`;
      else if (validSession) message += ` for session ${validSession}`;
      message += '.';

      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}

async function resolveActiveLogFile(baseDir = '.browser-echo'): Promise<string | null> {
  try {
    const cfgPath = joinPath(baseDir, 'config.json');
    const stat = await fsp.stat(cfgPath).catch(() => null);
    if (!stat || !stat.isFile()) return null;
    const ptrPath = joinPath(baseDir, 'current');
    const rel = (await fsp.readFile(ptrPath, 'utf-8').catch(() => '')).trim();
    if (!rel) return null;
    const file = joinPath(baseDir, rel, 'client.jsonl');
    await fsp.mkdir(dirname(file), { recursive: true }).catch(() => {});
    return file;
  } catch {
    return null;
  }
}