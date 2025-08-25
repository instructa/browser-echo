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
    const session = options?.session;
    const project = options?.project;

    if (project && project.trim()) {
      // Remove only entries for this project
      const p = project;
      this.entries = this.entries.filter(e => (e.project || '') !== p);
      return;
    }

    if (session && session.trim()) {
      const s = session.slice(0, 8);
      this.entries = this.entries.filter(e => (e.sessionId || '').slice(0, 8) !== s);
      return;
    }

    // Global clear
    this.entries.length = 0;
  }

  // Baseline methods removed - logs persist until buffer limit

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
    return items;
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