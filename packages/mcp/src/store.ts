export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  sessionId: string;
  level: BrowserLogLevel;
  text: string;
  time?: number;
  source?: string;
  stack?: string;
  tag?: string;
  /** Optional project name/identifier for multi-project segregation */
  project?: string;
}

const DEFAULT_BUFFER = 1000;

export class LogStore {
  private entries: LogEntry[] = [];
  private max: number;
  private baselineTimestamps: Map<string, number> = new Map(); // For soft clear

  constructor(max = DEFAULT_BUFFER) {
    this.max = Math.max(50, max | 0);
  }

  setMax(max: number) {
    this.max = Math.max(50, max | 0);
    while (this.entries.length > this.max) this.entries.shift();
  }

  append(entry: LogEntry) {
    if (this.entries.length >= this.max) this.entries.shift();
    this.entries.push(entry);
  }

  clear(options?: { session?: string; scope?: 'soft' | 'hard'; project?: string }) {
    const scope = options?.scope || 'hard';
    const session = options?.session;
    const project = options?.project;

    if (scope === 'soft') {
      if (project && project.trim()) {
        this.baselineTimestamps.set(`project:${project}`, Date.now());
      } else if (session && session.trim()) {
        this.baselineTimestamps.set(`session:${session.slice(0, 8)}`, Date.now());
      } else {
        // Global soft baseline (discouraged for multi-project, kept for backward compat)
        this.baselineTimestamps.set('__global__', Date.now());
      }
      return;
    }

    // Hard clear
    if (project && project.trim()) {
      // Remove only entries for this project and drop its baseline
      const p = project;
      this.entries = this.entries.filter(e => (e.project || '') !== p);
      this.baselineTimestamps.delete(`project:${p}`);
      return;
    }

    if (session && session.trim()) {
      const s = session.slice(0, 8);
      this.entries = this.entries.filter(e => (e.sessionId || '').slice(0, 8) !== s);
      this.baselineTimestamps.delete(`session:${s}`);
      return;
    }

    // Global hard clear
    this.entries.length = 0;
    this.baselineTimestamps.clear();
  }

  /** Set a baseline timestamp without deleting entries. If session omitted, use global baseline. */
  baseline(session?: string, when: number = Date.now()) {
    const key = session ? `session:${session.slice(0, 8)}` : '__global__';
    this.baselineTimestamps.set(key, when);
  }

  /** Set a baseline for a specific project (recommended for multi-project use). */
  baselineProject(project: string, when: number = Date.now()) {
    if (!project || !project.trim()) return;
    this.baselineTimestamps.set(`project:${project}`, when);
  }

  /** Set a global baseline (discouraged for multi-project; kept for backward compatibility). */
  baselineGlobal(when: number = Date.now()) {
    this.baselineTimestamps.set('__global__', when);
  }

  toText(session?: string): string {
    return this.snapshot(session).map((e) => {
      const sid = (e.sessionId || 'anon').slice(0, 8);
      const lvl = (e.level || 'log').toUpperCase();
      const tag = e.tag || '[browser]';
      let line = `${tag} [${sid}] ${lvl}: ${e.text}`;
      if (e.source) line += ` (${e.source})`;
      if (e.stack && e.stack.trim().length) {
        const indented = e.stack.split(/\r?\n/g).map((l) => (l.length ? `    ${l}` : l)).join('\n');
        return `${line}\n${indented}`;
      }
      return line;
    }).join('\n');
  }

  snapshot(session?: string): LogEntry[] {
    let items = this.entries.slice();
    if (session) items = items.filter(e => (e.sessionId || '').slice(0, 8) === session);

    const globalTs = this.baselineTimestamps.get('__global__') || 0;
    const sessionTs = session ? (this.baselineTimestamps.get(`session:${session}`) || 0) : 0;

    const filtered = items.filter((e) => {
      const t = e.time || 0;
      const projectTs = e.project ? (this.baselineTimestamps.get(`project:${e.project}`) || 0) : 0;
      // Session baseline only applies when caller filtered by that session.
      const threshold = Math.max(globalTs, sessionTs, projectTs);
      return t === 0 || t >= threshold;
    });

    if (filtered.length === 0 && this.entries.length > 0 && (globalTs || sessionTs)) {
      // eslint-disable-next-line no-console
      console.warn(`All ${this.entries.length} logs filtered out by baseline. Check timestamp format or baseline scope.`);
    }

    return filtered;
  }
}

export function normalizeLevel(l: string): BrowserLogLevel {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log','info','warn','error','debug'] as const).includes(l as any) ? (l as BrowserLogLevel) : 'log';
}

export function validateSessionId(session?: string): string | undefined {
  if (!session) return undefined;
  const trimmed = String(session).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 8);
}