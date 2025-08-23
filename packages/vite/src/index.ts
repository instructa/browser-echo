// Avoid exporting Vite types to prevent cross-version type mismatches in consumers
import ansis from 'ansis';
import type { BrowserLogLevel } from '@browser-echo/core';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join as joinPath, dirname } from 'node:path';

export interface BrowserLogsToTerminalOptions {
  enabled?: boolean;
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  showSource?: boolean;
  colors?: boolean;
  injectHtml?: boolean;
  stackMode?: 'none' | 'condensed' | 'full';
  batch?: { size?: number; interval?: number };
  truncate?: number;
  fileLog?: { enabled?: boolean; dir?: string };
  mcp?: { url?: string; routeLogs?: `/${string}`; suppressTerminal?: boolean; headers?: Record<string,string> };
}

type ResolvedOptions = Required<Omit<BrowserLogsToTerminalOptions, 'batch' | 'fileLog' | 'mcp'>> & {
  batch: Required<NonNullable<BrowserLogsToTerminalOptions['batch']>>;
  fileLog: Required<NonNullable<BrowserLogsToTerminalOptions['fileLog']>>;
  mcp: { url: string; routeLogs: `/${string}`; suppressTerminal: boolean; headers: Record<string,string>; suppressProvided: boolean };
};

const DEFAULTS: ResolvedOptions = {
  enabled: true,
  route: '/__client-logs',
  include: ['log', 'info', 'warn', 'error', 'debug'],
  preserveConsole: true,
  tag: '[browser]',
  showSource: true,
  colors: true,
  injectHtml: true,
  stackMode: 'condensed',
  batch: { size: 20, interval: 300 },
  truncate: 10_000,
  fileLog: { enabled: false, dir: 'logs/frontend' },
  mcp: { url: '', routeLogs: '/__client-logs', suppressTerminal: true, headers: {}, suppressProvided: false }
};

export default function browserEcho(opts: BrowserLogsToTerminalOptions = {}): any {
  const options: ResolvedOptions = {
    ...DEFAULTS,
    ...opts,
    batch: { ...DEFAULTS.batch, ...(opts.batch ?? {}) },
    fileLog: { ...DEFAULTS.fileLog, ...(opts.fileLog ?? {}) },
    mcp: {
      url: normalizeMcpBaseUrl(opts.mcp?.url || ''),
      routeLogs: (opts.mcp?.routeLogs || '/__client-logs') as `/${string}`,
      suppressTerminal: typeof opts.mcp?.suppressTerminal === 'boolean' ? opts.mcp.suppressTerminal : false,
      headers: opts.mcp?.headers || {},
      suppressProvided: typeof opts.mcp?.suppressTerminal === 'boolean'
    }
  };
  const VIRTUAL_ID = '\0virtual:browser-echo';
  const PUBLIC_ID = 'virtual:browser-echo';

  return {
    name: 'browser-echo',
    apply: 'serve',
    enforce: 'pre',

    resolveId(id: string) {
      if (id === PUBLIC_ID) return VIRTUAL_ID;
      return null;
    },
    load(id: string) {
      if (id !== VIRTUAL_ID) return null;
      return makeClientModule(options);
    },
    transformIndexHtml(html: string) {
      if (!options.enabled || !options.injectHtml) return;
      return { html, tags: [{ tag: 'script', attrs: { type: 'module', src: `/@id/${PUBLIC_ID}` }, injectTo: 'head' }] };
    },
    configureServer(server: any) {
      if (!options.enabled) return;
      attachMiddleware(server, options);
    }
  };
}

function normalizeMcpBaseUrl(input: string | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  const noSlash = raw.replace(/\/+$/, '');
  // If a full MCP URL is provided (ending in /mcp), convert to base
  return noSlash.replace(/\/mcp$/i, '');
}

function attachMiddleware(server: any, options: ResolvedOptions) {
  const sessionStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = joinPath(options.fileLog.dir, `dev-${sessionStamp}.log`);
  if (options.fileLog.enabled) { try { mkdirSync(dirname(logFilePath), { recursive: true }); } catch {} }

  // Simplified MCP ingest resolution: project JSON once; no fallback; retry on failure
  let resolvedBase = '';
  let resolvedIngest = '';
  let lastAnnouncement = '';

  const announce = (msg: string) => {
    if (msg && msg !== lastAnnouncement) {
      try { server.config.logger.info(msg); } catch {}
      lastAnnouncement = msg;
    }
  };

  async function tryPingHealth(base: string, timeoutMs = 400): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal as any, cache: 'no-store' as any });
      clearTimeout(t);
      return !!res?.ok;
    } catch { return false; }
  }

  function readProjectJson(): { url: string; route?: `/${string}` } | null {
    try {
      const p = joinPath(process.cwd(), '.browser-echo-mcp.json');
      if (existsSync(p)) {
        const raw = readFileSync(p, 'utf-8');
        let data: any;
        try { data = JSON.parse(raw); }
        catch (err: any) {
          try { server.config.logger.warn(`${options.tag} failed to parse .browser-echo-mcp.json: ${err?.message || err}`); } catch {}
          return null;
        }
        const url = (data?.url ? String(data.url) : '').replace(/\/$/, '');
        const route = (data?.route ? String(data.route) : '/__client-logs') as `/${string}`;
        if (url) return { url, route };
      }
    } catch {}
    return null;
  }

  async function resolveOnce() {
    // Prefer explicit plugin option if provided
    if (options.mcp.url) {
      const base = String(options.mcp.url).replace(/\/$/, '').replace(/\/mcp$/i, '');
      resolvedBase = base;
      resolvedIngest = `${base}${options.mcp.routeLogs}`;
      announce(`${options.tag} forwarding logs to MCP ingest at ${resolvedIngest}`);
      return;
    }

    const cfg = readProjectJson();
    if (cfg && cfg.url) {
      const base = String(cfg.url).replace(/\/$/, '');
      if (await tryPingHealth(base, 250)) {
        resolvedBase = base;
        resolvedIngest = `${base}${cfg.route || '/__client-logs'}`;
        announce(`${options.tag} forwarding logs to MCP ingest at ${resolvedIngest}`);
        return;
      }
    }
    resolvedBase = '';
    resolvedIngest = '';
  }

  // Resolve once at startup
  resolveOnce();

  server.middlewares.use(options.route, (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: Function) => {
    if (req.method !== 'POST') return next();
    collectBody(req).then(async (raw) => {
      let payload: ClientPayload | null = null;
      try { payload = JSON.parse(raw.toString('utf-8')); }
      catch { res.statusCode = 400; res.end('invalid JSON'); return; }

      if (!payload || !Array.isArray(payload.entries)) { res.statusCode = 400; res.end('invalid payload'); return; }

      // Mirror to MCP server if configured
      const targetIngest = resolvedIngest || '';
      if (targetIngest) {
        try {
          // do not await
          fetch(targetIngest, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...options.mcp.headers },
            body: JSON.stringify(payload),
            keepalive: true,
            cache: 'no-store'
          }).catch(() => { try { resolveOnce(); } catch {} });
        } catch {}
      }

      const logger = server.config.logger;
      const suppressTerminal = options.mcp.suppressProvided ? (options.mcp.suppressTerminal && !!targetIngest) : !!targetIngest;
      const shouldPrint = !suppressTerminal;
      const sid = (payload.sessionId ?? 'anon').slice(0, 8);
      for (const entry of payload.entries) {
        const level = normalizeLevel(entry.level);
        const truncated = typeof entry.text === 'string' && entry.text.length > options.truncate
          ? entry.text.slice(0, options.truncate) + '… (truncated)'
          : entry.text;
        let line = `${options.tag} [${sid}] ${level.toUpperCase()}: ${truncated}`;
        if (options.showSource && entry.source) line += ` (${entry.source})`;
        const colored = options.colors ? colorize(level, line) : line;
        if (shouldPrint) print(logger, level, colored);

        if (entry.stack && options.stackMode !== 'none' && shouldPrint) {
          const lines = options.stackMode === 'full'
            ? indent(entry.stack, '    ')
            : `    ${(String(entry.stack).split(/\r?\n/g).find((l) => l.trim().length > 0) || '').trim()}`;
          print(logger, level, ansis.dim(lines));
        }

        if (options.fileLog.enabled) {
          const time = new Date().toISOString();
          const toFile = [`[${time}] ${line}`];
          if (entry.stack && options.stackMode !== 'none') toFile.push(indent(entry.stack, '    '));
          try { appendFileSync(logFilePath, toFile.join('\n') + '\n'); } catch {}
        }
      }
      res.statusCode = 204; res.end();
    }).catch((err) => {
      server.config.logger.error(`${options.tag} middleware error: ${err?.message || err}`);
      res.statusCode = 500; res.end('error');
    });
  });
}

function collectBody(req: import('http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (c) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function print(logger: any, level: BrowserLogLevel, msg: string) {
  switch (level) {
    case 'error': logger.error(msg); break;
    case 'warn':  logger.warn(msg); break;
    default:      logger.info(msg);
  }
}
function indent(s: string, prefix = '  ') {
  return String(s).split(/\r?\n/g).map((l) => (l.length ? prefix + l : l)).join('\n');
}
function normalizeLevel(l: string): BrowserLogLevel {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log','info','warn','error','debug'] as const).includes(l as any) ? (l as BrowserLogLevel) : 'log';
}
function colorize(level: BrowserLogLevel, message: string): string {
  switch (level) {
    case 'error': return ansis.red(message);
    case 'warn':  return ansis.yellow(message);
    case 'debug': return ansis.magenta(message);
    case 'info':  return ansis.cyan(message);
    default:      return ansis.white(message);
  }
}

type ClientPayload = { sessionId?: string; entries: Array<{ level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; }>; };

function makeClientModule(options: Required<BrowserLogsToTerminalOptions>) {
  const include = JSON.stringify(options.include);
  const preserve = JSON.stringify(options.preserveConsole);
  const route = JSON.stringify(options.route);
  const tag = JSON.stringify(options.tag);
  const batchSize = String(options.batch?.size ?? 20);
  const batchInterval = String(options.batch?.interval ?? 300);
  return `
const __INSTALLED_KEY = '__vite_browser_echo_installed__';
if (!window[__INSTALLED_KEY]) {
  window[__INSTALLED_KEY] = true;
  const INCLUDE = ${include};
  const PRESERVE = ${preserve};
  const ROUTE = ${route};
  const TAG = ${tag};
  const BATCH_SIZE = ${batchSize} | 0;
  const BATCH_INTERVAL = ${batchInterval} | 0;
  const SESSION = (function(){try{const a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('')}catch{return String(Math.random()).slice(2,10)}})();
  const queue = []; let timer = null;
  function enqueue(entry){ queue.push(entry); if (queue.length >= BATCH_SIZE) flush(); else if (!timer) timer = setTimeout(flush, BATCH_INTERVAL); }
  function flush(){ if (timer) { clearTimeout(timer); timer = null; } if (!queue.length) return;
    const payload = JSON.stringify({ sessionId: SESSION, entries: queue.splice(0, queue.length) });
    try { if (navigator.sendBeacon) { navigator.sendBeacon(ROUTE, new Blob([payload], {type:'application/json'})); } else { fetch(ROUTE, { method: 'POST', headers:{'content-type':'application/json'}, body: payload, keepalive: true, cache: 'no-store' }).catch(()=>{}); } } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush); addEventListener('beforeunload', flush);
  const ORIGINAL = {};
  for (const level of INCLUDE) {
    const orig = console[level] ? console[level].bind(console) : console.log.bind(console);
    ORIGINAL[level] = orig;
    console[level] = (...args) => {
      const text = args.map((v)=>{try{if(typeof v==='string') return v; if(v instanceof Error) return (v.name||'Error')+': '+(v.message||''); const seen=new WeakSet(); return JSON.stringify(v,(k,val)=>{ if(typeof val==='bigint') return String(val)+'n'; if(typeof val==='function') return '[Function '+(val.name||'anonymous')+']'; if(val instanceof Error) return {name:val.name,message:val.message,stack:val.stack}; if(typeof val==='symbol') return val.toString(); if(val && typeof val==='object'){ if(seen.has(val)) return '[Circular]'; seen.add(val); } return val; }); } catch { try { return String(v) } catch { return '[Unserializable]' } }}).join(' ');
      const stack = (new Error()).stack?.split('\\n').slice(1).filter(l=>!/virtual:browser-echo|enqueue|flush/.test(l)).join('\\n') || '';
      const srcMatch = stack.match(/\\(?((?:file:\\/\\/|https?:\\/\\/|\\/)[^) \\n]+):(\\d+):(\\d+)\\)?/);
      const source = srcMatch ? (srcMatch[1]+':'+srcMatch[2]+':'+srcMatch[3]) : '';
      enqueue({ level, text, time: Date.now(), stack, source });
      if (PRESERVE) { try { orig(...args) } catch {} }
    };
  }
  try { ORIGINAL['info']?.(TAG + ' forwarding console logs to ' + ROUTE + ' (session ' + SESSION + ')'); } catch {}
}
`;
}
