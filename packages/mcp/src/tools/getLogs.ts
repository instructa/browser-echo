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
        includeStack = false,
        limit = 1000,
        contains,
        sinceMs,
        project,
        autoBaseline = true,
        stackedMode = false
      } = safeArgs as typeof GetLogsSchema['_output'];

      const validSession = validateSessionId(session);
      const validSince = typeof sinceMs === 'number' && sinceMs >= 0 ? sinceMs : undefined;

      // Standardize: let store handle session filtering
      let items = store.snapshot(validSession);
      if (validSince) items = items.filter(e => !e.time || e.time >= validSince);
      if (level?.length) items = items.filter(e => level.includes(e.level));
      if (project) items = items.filter(e => (e.project || '') === project);
      if (contains) items = items.filter(e => (e.text || '').includes(contains));
      const final = includeStack ? items : items.map(e => ({ ...e, stack: '' }));

      // Auto-select a single active project by recency when no project is specified
      let autoProject: string | undefined;
      if (!project) {
        const projectsAll = new Set(final.map(e => e.project || '')); projectsAll.delete('');
        if (projectsAll.size > 1) {
          const latestByProject: Record<string, number> = {};
          for (const e of final) {
            const p = e.project || '';
            if (!p) continue;
            const t = e.time || 0;
            if (!latestByProject[p] || t > latestByProject[p]) latestByProject[p] = t;
          }
          const now = Date.now();
          const recentWindowMs = 60_000; // 60s window for "active" project
          const active = Object.entries(latestByProject)
            .filter(([, t]) => t > 0 && (now - t) <= recentWindowMs)
            .map(([p]) => p);
          if (active.length === 1) autoProject = active[0];
        }
      }

      const baseForOutput = autoProject ? final.filter(e => (e.project || '') === autoProject) : final;
      const limited = limit && baseForOutput.length > limit ? baseForOutput.slice(-limit) : baseForOutput;

      // Multi-project awareness: if no explicit project and multiple projects exist, show grouped preview
      const uniqueProjects = new Set(limited.map(e => e.project || '')); uniqueProjects.delete('');
      let text: string;
      if (!project && !autoProject && uniqueProjects.size > 1) {
        const groups = Array.from(uniqueProjects.values());
        const byProject: Record<string, typeof limited> = {};
        for (const p of groups) byProject[p] = [];
        for (const e of limited) {
          const key = e.project || '';
          if (key) byProject[key].push(e);
        }
        // Heuristic: order by most recent entry time desc
        const sortedProjects = groups.sort((a, b) => {
          const at = (byProject[a].at(-1)?.time || 0);
          const bt = (byProject[b].at(-1)?.time || 0);
          return bt - at;
        });
        const previewPerProject = 5;
        const sections: string[] = [];
        for (const p of sortedProjects) {
          const entries = byProject[p];
          const preview = entries.slice(-previewPerProject).map(e => {
            const sid = (e.sessionId || 'anon').slice(0, 8);
            const lvl = (e.level || 'log').toUpperCase();
            const tag = e.tag || '[browser]';
            let line = `[${p}] ${tag} [${sid}] ${lvl}: ${e.text}`;
            if (e.source) line += ` (${e.source})`;
            if (includeStack && e.stack?.trim()) {
              const indented = e.stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
              return `${line}\n${indented}`;
            }
            return line;
          }).join('\n');
          sections.push(`${p} – ${entries.length} entries (use get_logs with { project: "${p}" } for full list):\n${preview}`);
        }
        text = sections.join('\n\n');
      } else {
        text = limited.map(e => {
          const sid = (e.sessionId || 'anon').slice(0, 8);
          const lvl = (e.level || 'log').toUpperCase();
          const projectTag = e.project ? `[${e.project}]` : '';
          const tag = e.tag || '[browser]';
          let line = `${projectTag ? projectTag + ' ' : ''}${tag} [${sid}] ${lvl}: ${e.text}`;
          if (e.source) line += ` (${e.source})`;
          if (includeStack && e.stack?.trim()) {
            const indented = e.stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
            return `${line}\n${indented}`;
          }
          return line;
        }).join('\n');
      }

      // Auto-baseline unless stackedMode
      try {
        if (autoBaseline && !stackedMode) {
          // baseline per project if selected; else by session or global
          const baselineSession = validSession;
          store.baseline(baselineSession);
        }
      } catch {}

      return {
        content: [
          { type: 'text' as const, text }
        ]
      };
    }
  );
}