import type { McpToolContext } from '../types';
import { GetLogsSchema } from '../schemas/logs';
import { validateSessionId } from '../store';
import { readJsonl } from '../file-store';
import { promises as fsp } from 'node:fs';
import { dirname, join as joinPath } from 'node:path';

export function registerGetLogsTool(ctx: McpToolContext) {
  const { mcp, store } = ctx;

  mcp.tool(
    'get_logs',
    'Fetch recent frontend browser console logs (errors/warnings/info). Use this when checking hydration errors, network failures, or React/Next warnings.',
    GetLogsSchema,
    async (args, _extra) => {
      const safeArgs = args || {} as any;
      const {
        level,
        session,
        includeStack = false,
        limit = 1000,
        contains,
        sinceMs,
        sinceId,          // <— new
        project,
      } = safeArgs as typeof GetLogsSchema['_output'];

      const validSession = validateSessionId(session);
      const validSince = typeof sinceMs === 'number' && sinceMs >= 0 ? sinceMs : undefined;

      const baseDir = (process.env.BROWSER_ECHO_DIR || '.browser-echo').trim() || '.browser-echo';
      const activeFile = await resolveActiveLogFile(baseDir);
      if (activeFile) {
        const { items, nextSinceId } = await readJsonl(activeFile, {
          sinceId,
          sinceMs: validSince,
          levels: level,
          project,
          contains,
          limit
        });

        if (items.length === 0) {
          const tailHint = typeof sinceId === 'number' ? ` (sinceId=${sinceId})` : '';
          return { content: [{ type: 'text' as const, text: `No logs found in ${activeFile}${tailHint}.` }] };
        }

        const lines = items.map((e) => {
          const sid = String(e.sessionId || 'anon').slice(0, 8);
          const lvl = String(e.level || 'log').toUpperCase();
          const projectTag = e.project ? `[${e.project}] ` : '';
          const tag = '[browser]';
          let line = `${projectTag}${tag} [${sid}] ${lvl}: ${e.message}`;
          if (e.source) line += ` (${e.source})`;
          const stack = includeStack ? (e.meta?.stack ? String(e.meta.stack) : '') : '';
          if (stack && stack.trim()) {
            const indented = stack.split(/\r?\n/g).map(l => l ? `    ${l}` : l).join('\n');
            return `${line}\n${indented}`;
          }
          return line;
        }).join('\n');

        const footer = `\n\n[nextSinceId: ${nextSinceId}]`;
        return { content: [{ type: 'text' as const, text: lines + footer }] };
      }

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
        } else if (projectsAll.size === 1) {
          // If only one project exists, auto-select it
          autoProject = Array.from(projectsAll)[0];
        }
      }

      const baseForOutput = autoProject ? final.filter(e => (e.project || '') === autoProject) : final;
      const limited = limit && baseForOutput.length > limit ? baseForOutput.slice(-limit) : baseForOutput;

      // Multi-project awareness: if no explicit project and multiple projects exist, show grouped preview
      const uniqueProjects = new Set(limited.map(e => e.project || '')); uniqueProjects.delete('');
      let text: string;
      
      // If no logs found, provide helpful message
      if (limited.length === 0) {
        const allProjects = new Set(store.snapshot().map(e => e.project || '').filter(p => p));
        if (allProjects.size > 0) {
          text = `No logs found matching your criteria. Available projects: ${Array.from(allProjects).join(', ')}\n\nTry: get_logs with { project: "<project-name>" }`;
        } else {
          text = 'No logs available yet.';
        }
        return {
          content: [
            { type: 'text' as const, text }
          ]
        };
      }
      
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

      // Add timestamp info to help users understand log freshness
      const now = Date.now();
      const oldestTime = limited.find(e => e.time)?.time || 0;
      const newestTime = limited.findLast(e => e.time)?.time || 0;
      
      let timestampInfo = '';
      if (oldestTime && newestTime) {
        const ageMs = now - oldestTime;
        const ageSec = Math.floor(ageMs / 1000);
        const ageMin = Math.floor(ageSec / 60);
        
        const rangeMs = newestTime - oldestTime;
        const rangeSec = Math.floor(rangeMs / 1000);
        
        if (ageMin > 0) {
          timestampInfo = `\n\n[Log range: ${rangeSec}s, oldest: ${ageMin}m ago]`;
        } else {
          timestampInfo = `\n\n[Log range: ${rangeSec}s, oldest: ${ageSec}s ago]`;
        }
      }

      return {
        content: [
          { type: 'text' as const, text: text + timestampInfo }
        ]
      };
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
    // Ensure parent dir exists; do not create file here
    await fsp.mkdir(dirname(file), { recursive: true }).catch(() => {});
    const fstat = await fsp.stat(file).catch(() => null);
    if (!fstat || !fstat.isFile()) return file; // may not exist yet, but path is valid
    return file;
  } catch {
    return null;
  }
}