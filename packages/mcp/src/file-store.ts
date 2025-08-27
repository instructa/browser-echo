import { promises as fsp } from 'node:fs';
import { createReadStream, promises as fsnp } from 'node:fs';
import { basename, dirname, join as joinPath, resolve as resolvePath } from 'node:path';

export type SessionMode = 'timestamped' | 'single';

export interface EchoConfig {
  version: number;
  sessionMode: SessionMode;
  logDirectory: string;
  retention?: { maxSessions?: number; maxAge?: string; maxSize?: string };
}

export async function loadConfig(baseDir = '.browser-echo'): Promise<EchoConfig | null> {
  try {
    const file = joinPath(baseDir, 'config.json');
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat || !stat.isFile()) return null;
    const raw = await fsp.readFile(file, 'utf-8');
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return null;
    const sessionMode: SessionMode = (cfg.sessionMode === 'single' ? 'single' : 'timestamped');
    const logDirectory = cfg.logDirectory || baseDir;
    return { version: Number(cfg.version || 1), sessionMode, logDirectory, retention: cfg.retention };
  } catch {
    return null;
  }
}

export async function ensureSession(config: EchoConfig): Promise<{ sessionRel: string; clientPath: string }> {
  const baseDir = config.logDirectory || '.browser-echo';
  const sessionsDir = joinPath(baseDir, 'sessions');

  await fsp.mkdir(sessionsDir, { recursive: true }).catch(() => {});

  const stamp = () => {
    const d = new Date();
    const iso = d.toISOString().replace(/[:.]/g, '-');
    const ymd = iso.slice(0, 10).replace(/-/g, '');
    const hms = iso.slice(11, 19).replace(/:/g, '-');
    return `${ymd}-${hms}`;
  };

  const rel = config.sessionMode === 'single'
    ? 'sessions/single'
    : `sessions/${stamp()}`;

  const abs = joinPath(baseDir, rel);
  await fsp.mkdir(abs, { recursive: true }).catch(() => {});
  const clientPath = joinPath(abs, 'client.jsonl');

  // Ensure the file exists (touch) – appenders can rely on it.
  try { await fsp.appendFile(clientPath, ''); } catch {}

  return { sessionRel: rel, clientPath };
}

export async function writeCurrent(baseDir: string, sessionRel: string): Promise<void> {
  await fsp.mkdir(baseDir, { recursive: true }).catch(() => {});
  const ptr = joinPath(baseDir, 'current');
  await fsp.writeFile(ptr, `${sessionRel}\n`, 'utf-8');
}

/** JSONL model written by frameworks */
export interface JsonlRow {
  timestamp: string;
  level: string;
  source?: string;
  message: string;
  meta?: any;
  sessionId?: string;
  project?: string;
}

/** Append a single JSONL row (message is enforced to ≤ 4KB UTF‑8). */
export async function appendJsonl(file: string, row: JsonlRow): Promise<void> {
  const safeRow = { ...row, message: truncateUtf8(row.message ?? '', 4096) };
  const line = JSON.stringify(safeRow) + '\n';
  const fh = await fsp.open(file, 'a');
  try {
    await fh.appendFile(line, 'utf-8');
  } finally {
    await fh.close();
  }
}

export interface ReadOpts {
  sinceId?: number;
  sinceMs?: number;
  levels?: string[];
  project?: string;
  contains?: string;
  limit?: number;
}

export interface ReadItem extends JsonlRow { byteOffset: number; }

/** Read JSONL with byte‑offset cursor and filters. Skips partial first line if starting mid‑line. */
export async function readJsonl(file: string, opts: ReadOpts = {}): Promise<{ items: ReadItem[]; nextSinceId: number }> {
  const {
    sinceId = 0,
    sinceMs,
    levels,
    project,
    contains,
    limit = 1000
  } = opts;

  const out: ReadItem[] = [];
  const lvSet = Array.isArray(levels) && levels.length ? new Set(levels) : null;
  const needle = contains && contains.length ? contains : null;
  const proj = project && project.length ? project : null;

  const startPos = typeof sinceId === 'number' && sinceId >= 0 ? sinceId : 0;

  // Stream from startPos; compute absolute byte offsets manually
  const stream = createReadStream(file, { start: startPos, encoding: 'utf-8' as BufferEncoding });
  let absoluteOffset = startPos;
  let buf = '';
  let firstChunk = true;

  // Helper to process full lines present in buffer
  const processLines = () => {
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);                 // without newline
      const lineStartOffset = absoluteOffset;         // starting offset of this line
      const consumed = idx + 1;                       // include newline
      buf = buf.slice(consumed);
      absoluteOffset += consumed;

      // If the stream started mid‑line, the first extracted "line" is partial — skip it.
      if (firstChunk && startPos > 0) {
        firstChunk = false;
        continue;
      }
      firstChunk = false;

      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as JsonlRow;
        // Basic shape checks
        if (!obj || !obj.message || !obj.timestamp) continue;

        // Filters
        if (lvSet && !lvSet.has(normalizeLevel(obj.level))) continue;
        if (proj && (obj.project || '') !== proj) continue;
        if (needle && !String(obj.message).includes(needle)) continue;
        if (sinceMs && Number.isFinite(sinceMs)) {
          const t = Date.parse(obj.timestamp);
          if (Number.isFinite(t) && t < sinceMs!) continue;
        }

        out.push({ ...obj, level: normalizeLevel(obj.level), byteOffset: lineStartOffset });

        if (out.length >= limit) return true; // signal to stop early
      } catch {
        // malformed JSON line – ignore
      }
    }
    return false;
  };

  const earlyStop = await new Promise<boolean>((resolve, reject) => {
    stream.on('data', (chunk: string) => {
      buf += chunk;
      const stop = processLines();
      if (stop) {
        try { stream.destroy(); } catch {}
        resolve(true);
      }
    });
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(false));
  }).catch(() => false);

  // Do not parse trailing partial line (buf) – skip by design
  const nextSinceId = out.length ? out[out.length - 1].byteOffset : sinceId;
  return { items: out, nextSinceId };
}

export async function rotate(file: string): Promise<string> {
  const dir = dirname(file);
  const base = basename(file);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotated = joinPath(dir, `${base}.${stamp}`);
  try {
    await fsp.mkdir(dir, { recursive: true }).catch(() => {});
    const stat = await fsp.stat(file).catch(() => null);
    if (stat && stat.isFile()) {
      await fsp.rename(file, rotated);
    } else {
      // If nothing to rotate, just return the intended name
      return rotated;
    }
  } finally {
    // Recreate the original file so writers can continue seamlessly
    try { await fsp.writeFile(file, '', 'utf-8'); } catch {}
  }
  return rotated;
}

// --------- helpers ---------

function normalizeLevel(l: string | undefined): string {
  if (!l) return 'log';
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  const lv = String(l).toLowerCase();
  return (['log','info','warn','error','debug'] as const).includes(lv as any) ? lv : 'log';
}

function truncateUtf8(input: string, maxBytes: number): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(input);
  if (bytes.byteLength <= maxBytes) return input;
  // binary search to preserve codepoint boundaries and leave room for ellipsis
  let lo = 0, hi = input.length;
  const budget = Math.max(0, maxBytes - 3);
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const sliceBytes = enc.encode(input.slice(0, mid));
    if (sliceBytes.byteLength <= budget) lo = mid;
    else hi = mid - 1;
  }
  return input.slice(0, lo) + '…';
}