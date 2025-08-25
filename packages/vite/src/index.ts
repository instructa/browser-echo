// Avoid exporting Vite types to prevent cross-version type mismatches in consumers
import ansis from 'ansis';
import type { BrowserLogLevel } from '@browser-echo/core';
import { mkdirSync, appendFileSync } from 'node:fs';
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

  // Single global server model: compute base; manage connection state
  let resolvedBase = '';
  let resolvedIngest = '';
  let hasForwardedSuccessfully = false; // suppress only after first confirmed 2xx
  let lastAnnouncement = '';

  const announce = (msg: string) => {
    if (msg && msg !== lastAnnouncement) {
      try { server.config.logger.info(msg); } catch {}
      lastAnnouncement = msg;
    }
  };

  function computeBaseOnce() {
    const base = String(options.mcp.url || process.env.BROWSER_ECHO_MCP_URL || 'http://127.0.0.1:5179')
      .replace(/\/$/, '')
      .replace(/\/mcp$/i, '');
    resolvedBase = base;
    resolvedIngest = `${base}${options.mcp.routeLogs}`;
  }

  computeBaseOnce();

  // Start a small background probe to detect MCP coming online after Vite
  startHealthProbe();

  async function probeHealth(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 400);
      const res = await fetch(`${resolvedBase}/health`, { signal: ctrl.signal as any, cache: 'no-store' as any });
      clearTimeout(t);
      return !!res && res.ok;
    } catch {
      return false;
    }
  }

  function startHealthProbe() {
    // Only starts once per dev server process
    let started = false;
    if (started) return;
    started = true;
    const interval = setInterval(async () => {
      if (hasForwardedSuccessfully) return; // already forwarding
      const ok = await probeHealth();
      if (ok) {
        hasForwardedSuccessfully = true;
        announce(`${options.tag} forwarding logs to MCP ingest at ${resolvedIngest}`);
      }
    }, 1500);
    // NOTE: we intentionally do not clear the interval; it's cheap and guarded above.
  }

  server.middlewares.use(options.route, (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: Function) => {
    if (req.method !== 'POST') return next();
    collectBody(req).then(async (raw) => {
      let payload: ClientPayload | null = null;
      try { payload = JSON.parse(raw.toString('utf-8')); }
      catch { res.statusCode = 400; res.end('invalid JSON'); return; }

      if (!payload || !Array.isArray(payload.entries)) { res.statusCode = 400; res.end('invalid payload'); return; }

      // Mirror to MCP server (fire-and-forget) and update connection state
      const targetIngest = resolvedIngest;
      try {
        const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
        const extraHeaders: Record<string,string> = {};
        if (projectName) extraHeaders['X-Browser-Echo-Project-Name'] = projectName;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 500);
        fetch(targetIngest, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...extraHeaders, ...options.mcp.headers },
          body: JSON.stringify(payload),
          keepalive: true,
          cache: 'no-store',
          signal: ctrl.signal as any
        }).then((res) => {
          clearTimeout(timeout);
          const ok = !!res && res.ok;
          if (ok && !hasForwardedSuccessfully) {
            hasForwardedSuccessfully = true;
            announce(`${options.tag} forwarding logs to MCP ingest at ${targetIngest}`);
          }
        }).catch(() => { try { clearTimeout(timeout); } catch {} });
      } catch {}

      const logger = server.config.logger;
      // Only suppress after first successful forward; never re-enable
      const shouldPrint = !hasForwardedSuccessfully;
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
      const stack = (new Error()).stack || '';
      enqueue({ level, text, time: Date.now(), stack });
      if (PRESERVE) { try { orig(...args) } catch {} }
    };
  }
  try { ORIGINAL['info']?.(TAG + ' forwarding console logs to ' + ROUTE + ' (session ' + SESSION + ')'); } catch {}
}
`;
}
