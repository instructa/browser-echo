// Avoid exporting Vite types to prevent cross-version type mismatches in consumers
import ansis from 'ansis';
import type { BrowserLogLevel, NetworkCaptureOptions } from 
'@browser-echo/core';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join as joinPath, dirname } from 'node:path';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

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
  network?: NetworkCaptureOptions;
}

type ResolvedOptions = Required<Omit<BrowserLogsToTerminalOptions, 'batch' | 'fileLog' | 'mcp' | 'network'>> & {
  batch: Required<NonNullable<BrowserLogsToTerminalOptions['batch']>>;
  fileLog: Required<NonNullable<BrowserLogsToTerminalOptions['fileLog']>>;
  mcp: { url: string; routeLogs: `/${string}`; suppressTerminal: boolean; headers: Record<string,string>; suppressProvided: boolean };
  network?: NetworkCaptureOptions;
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
  mcp: { url: '', routeLogs: '/__client-logs', suppressTerminal: false, headers: {}, suppressProvided: false },
  network: { enabled: true }
};

export default function browserEcho(opts: BrowserLogsToTerminalOptions = {}): any {
  console.log('[BROWSER-ECHO] Plugin initializing with options:', opts);
  const options: ResolvedOptions = {
    ...DEFAULTS,
    ...opts,
    batch: { ...DEFAULTS.batch, ...(opts.batch ?? {}) },
    fileLog: { ...DEFAULTS.fileLog, ...(opts.fileLog ?? {}) },
    mcp: {
      url: normalizeMcpBaseUrl(opts.mcp?.url || ''),
      routeLogs: (opts.mcp?.routeLogs ?? DEFAULTS.mcp.routeLogs) as `/${string}`,
      suppressTerminal: (opts.mcp?.suppressTerminal ?? DEFAULTS.mcp.suppressTerminal) as boolean,
      headers: opts.mcp?.headers ?? {},
      suppressProvided: typeof opts.mcp?.suppressTerminal === 'boolean'
    }
  };
  console.log('[BROWSER-ECHO] Resolved options:', { enabled: options.enabled, route: options.route, mcp: options.mcp });
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
      console.log('[BROWSER-ECHO] configureServer called, enabled:', options.enabled);
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

// Generate or retrieve a stable per-dev-server id (persisted in-memory)
let __viteDevInstanceId: string | null = null;
function getOrCreateDevId(): string {
  if (__viteDevInstanceId) return __viteDevInstanceId;
  try {
    const wc: Crypto | undefined = (globalThis as any).crypto || (nodeWebcrypto as unknown as Crypto);
    const a = new Uint8Array(8);
    // @ts-ignore
    wc?.getRandomValues?.(a);
    __viteDevInstanceId = Array.from(a).map((b) => b.toString(16).padStart(2,'0')).join('');
  } catch {
    __viteDevInstanceId = String(Math.random()).slice(2, 10);
  }
  return __viteDevInstanceId;
}

function attachMiddleware(server: any, options: ResolvedOptions) {
  const sessionStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = joinPath(options.fileLog.dir, `dev-${sessionStamp}.log`);
  if (options.fileLog.enabled) { try { mkdirSync(dirname(logFilePath), { recursive: true }); } catch {} }

  // Single global server model: compute base; manage connection state
  let resolvedBase = '';
  let resolvedIngest = '';
  let isRemoteAvailable = false; // reflects current availability of the configured/current MCP ingest
  let lastAnnouncement = '';
  let discoverySource: 'plugin' | 'env' | 'fixed-port' = 'fixed-port';

  const announce = (msg: string) => {
    if (msg && msg !== lastAnnouncement) {
      try { server.config.logger.info(msg); } catch {}
      lastAnnouncement = msg;
    }
  };

  function computeBaseOnce() {
    // 1) Plugin option takes precedence
    if (options.mcp.url) {
      const base = String(options.mcp.url).trim().replace(/\/$/, '').replace(/\/mcp$/i, '');
      resolvedBase = base;
      resolvedIngest = `${base}${options.mcp.routeLogs}`;
      discoverySource = 'plugin';
      return;
    }
    // 2) Environment override
    const envUrl = String(process.env.BROWSER_ECHO_MCP_URL || '').trim();
    if (envUrl) {
      const base = envUrl.replace(/\/$/, '').replace(/\/mcp$/i, '');
      resolvedBase = base;
      resolvedIngest = `${base}${options.mcp.routeLogs}`;
      discoverySource = 'env';
      return;
    }
    // 3) Fixed port default
    const candidate = 'http://127.0.0.1:5179';
    resolvedBase = candidate;
    resolvedIngest = `${candidate}${options.mcp.routeLogs}`;
    discoverySource = 'fixed-port';
  }

  computeBaseOnce();
  // Start with unavailable; only mark available after first successful ACK
  isRemoteAvailable = false;

  // Remove background health probe: availability is determined solely by forward + ACK

  server.middlewares.use(options.route, (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: Function) => {
    if (req.method !== 'POST') return next();
    
    const debugEnabled = String(process.env.BROWSER_ECHO_DEBUG || '').trim() !== '' && String(process.env.BROWSER_ECHO_DEBUG).toLowerCase() !== '0' && String(process.env.BROWSER_ECHO_DEBUG).toLowerCase() !== 'false';
    
    if (debugEnabled) {
      console.log('[BROWSER-ECHO MIDDLEWARE] Received POST request to', options.route);
    }
    
    collectBody(req).then(async (raw) => {
      try {
        if (debugEnabled) {
          console.log('[BROWSER-ECHO MIDDLEWARE] Raw body length:', raw.length);
        }
        
        let payload: ClientPayload | null = null;
        try { 
          payload = JSON.parse(raw.toString('utf-8')); 
          if (debugEnabled) {
            console.log('[BROWSER-ECHO MIDDLEWARE] Parsed payload successfully');
          }
        }
        catch (e) { 
          if (debugEnabled) {
            console.error('[BROWSER-ECHO MIDDLEWARE] JSON parse error:', e);
          }
          res.statusCode = 400; 
          res.end('invalid JSON'); 
          return; 
        }

        if (!payload || !Array.isArray(payload.entries)) { 
          if (debugEnabled) {
            console.error('[BROWSER-ECHO MIDDLEWARE] Invalid payload structure');
          }
          res.statusCode = 400; 
          res.end('invalid payload'); 
          return; 
        }

        const logger = server.config.logger;
        let debugPrinted = false as any;
        
        // Terminal printing policy:
        // - Default: ALWAYS print locally
        // - If BROWSER_ECHO_SUPPRESS_TERMINAL=1|true, suppress when remote ingest is confirmed available
        // - If BROWSER_ECHO_SUPPRESS_TERMINAL=0|false, force printing regardless of remote availability
        const envSup = String(process.env.BROWSER_ECHO_SUPPRESS_TERMINAL ?? '').trim().toLowerCase();
        const envForceSuppress = envSup === '1' || envSup === 'true';
        const envForcePrint = envSup === '0' || envSup === 'false';

        let shouldPrint = true;
        if (envForcePrint) {
          shouldPrint = true;
        } else if (envForceSuppress) {
          // Suppress only when we have a confirmed remote ingest connection
          shouldPrint = !isRemoteAvailable;
        }
        
        if (debugEnabled) {
          console.log(`[BROWSER-ECHO MIDDLEWARE] Processing ${payload.entries.length} entries, shouldPrint=${shouldPrint}, isRemoteAvailable=${isRemoteAvailable}, envForceSuppress=${envForceSuppress}, envForcePrint=${envForcePrint}`);
        }
      


      // Mirror to MCP server and update suppression state based on result
      const targetIngest = resolvedIngest;
      if (targetIngest && !envForcePrint) {
      try {
          const projectName = (process.env.BROWSER_ECHO_PROJECT_NAME || (process.env.npm_package_name || '')).trim();
          const extraHeaders: Record<string,string> = {};
          if (projectName) extraHeaders['X-Browser-Echo-Project-Name'] = projectName;
          // Stable per-dev-server id
          const devId = getOrCreateDevId();
          extraHeaders['X-Browser-Echo-Dev-Id'] = devId;
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
            // Validate ACK to ensure this forward corresponds to our project and dev server
            let ackOk = false;
            let isOwner = false;
            try {
              const ack = res.headers?.get?.('X-Browser-Echo-Ack') || '';
              if (ack) {
                const mProject = /project=([^;]*)/i.exec(ack);
                const mDev = /devId=([^;]*)/i.exec(ack);
                const mOwner = /owner=([^;]*)/i.exec(ack);
                const aProject = mProject ? decodeURIComponent(mProject[1]) : '';
                const aDev = mDev ? decodeURIComponent(mDev[1]) : '';
                isOwner = (mOwner ? String(mOwner[1]) : '') === '1';
                ackOk = (!projectName || aProject === projectName) && aDev === devId && isOwner;
              }
            } catch {}
            if (ok && ackOk) {
              if (!isRemoteAvailable) {
              isRemoteAvailable = true;
              announce(`${options.tag} forwarding logs to MCP ingest at ${targetIngest}`);
              }
            } else {
              if (isRemoteAvailable) {
              isRemoteAvailable = false;
              announce(`${options.tag} MCP ingest unavailable; printing logs locally`);
              }
            }
          }).catch(() => {
            try { clearTimeout(timeout); } catch {}
            if (isRemoteAvailable) {
              isRemoteAvailable = false;
              announce(`${options.tag} MCP ingest unavailable; printing logs locally`);
            }
          });
        } catch {}
        }

      if (debugEnabled && !debugPrinted) {
        debugPrinted = true;
        try {
          logger.info(`${options.tag} debug: cwd=${process.cwd()} source=${discoverySource} url=${resolvedBase} route=${options.mcp.routeLogs} suppress=${String(!shouldPrint)} available=${String(isRemoteAvailable)}`);
      } catch {}
      }
      const sid = (payload.sessionId ?? 'anon').slice(0, 8);
      for (const entry of payload.entries) {
        const level = normalizeLevel(entry.level);
        const truncated = typeof entry.text === 'string' && entry.text.length > options.truncate
          ? entry.text.slice(0, options.truncate) + '… (truncated)'
          : entry.text;
        let line = `${options.tag} [${sid}] ${level.toUpperCase()}: ${truncated}`;
        if (options.showSource && entry.source) line += ` (${entry.source})`;
        const colored = options.colors ? colorize(level, line) : line;
        if (debugEnabled) {
          console.log(`[BROWSER-ECHO MIDDLEWARE] [PRINT] shouldPrint=${shouldPrint}, line="${line}"`);
        }
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
      } catch (middlewareError) {
        if (debugEnabled) {
          console.error('[BROWSER-ECHO MIDDLEWARE] Caught error in middleware:', middlewareError);
        }
        server.config.logger.error(`${options.tag} middleware error: ${middlewareError?.message || middlewareError}`);
        res.statusCode = 500; res.end('error');
      }
    }).catch((err) => {
      if (debugEnabled) {
        console.error('[BROWSER-ECHO MIDDLEWARE] collectBody error:', err);
      }
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

function makeClientModule(options: ResolvedOptions) {
  const include = JSON.stringify(options.include);
  const preserve = JSON.stringify(options.preserveConsole);
  const route = JSON.stringify(options.route);
  const tag = JSON.stringify(options.tag);
  const batchSize = String(options.batch?.size ?? 20);
  const batchInterval = String(options.batch?.interval ?? 300);
  const network = JSON.stringify(options.network ?? null);
  return `
const __INSTALLED_KEY = '__vite_browser_echo_installed__';
if (typeof window !== 'undefined' && !window[__INSTALLED_KEY]) {
  window[__INSTALLED_KEY] = true;
  const INCLUDE = ${include};
  const PRESERVE = ${preserve};
  const ROUTE = ${route};
  const TAG = ${tag};
  const BATCH_SIZE = ${batchSize} | 0;
  const BATCH_INTERVAL = ${batchInterval} | 0;
  const NETWORK = ${network};
  const SESSION = (function(){try{const a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('')}catch{return String(Math.random()).slice(2,10)}})();

  const queue = []; let timer = null;
  function enqueue(entry){ queue.push(entry); if (queue.length >= BATCH_SIZE) flush(); else if (!timer) timer = setTimeout(flush, BATCH_INTERVAL); }
  function flush(){ if (timer) { clearTimeout(timer); timer = null; } if (!queue.length) return;
    const payload = JSON.stringify({ sessionId: SESSION, entries: queue.splice(0, queue.length) });
    try { if (navigator.sendBeacon) { navigator.sendBeacon(ROUTE, new Blob([payload], {type:'application/json'})); } else { fetch(ROUTE, { method: 'POST', headers:{'content-type':'application/json'}, body: payload, keepalive: true, cache: 'no-store' }).catch(()=>{}); } } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush); addEventListener('beforeunload', flush);

  function safeFormat(v){ if(typeof v==='string') return v; if(v && v instanceof Error) return (v.name||'Error')+': '+(v.message||'');
    try{const seen=new WeakSet(); return JSON.stringify(v,(k,val)=>{ if(typeof val==='bigint') return String(val)+'n';
      if(typeof val==='function') return '[Function '+(val.name||'anonymous')+']';
      if(val && val instanceof Error) return {name:val.name,message:val.message,stack:val.stack};
      if(typeof val==='symbol') return val.toString();
      if(val && typeof val==='object'){ if(seen.has(val)) return '[Circular]'; seen.add(val) } return val; }); }
    catch(e){ try{return String(v)}catch{return '[Unserializable]'} } }

  const ORIGINAL = {};
  for (const level of INCLUDE) {
    const orig = console[level] ? console[level].bind(console) : console.log.bind(console);
    ORIGINAL[level] = orig;
    console[level] = (...args) => {
      const text = args.map(safeFormat).join(' ');
      enqueue({ level, text, time: Date.now(), stack: '', source: '' });
      if (PRESERVE) { try { orig(...args) } catch {} }
    };
  }
  try { ORIGINAL['info'] && ORIGINAL['info'](TAG + ' forwarding console logs to ' + ROUTE + ' (session ' + SESSION + ')'); } catch {}

  // Network interception (fetch/XHR)
  try {
    if (NETWORK && NETWORK.enabled) {
      // fetch interception
      try {
        const captureFetch = (typeof NETWORK.captureFetch === 'boolean') ? NETWORK.captureFetch : true;
        if (captureFetch && typeof window.fetch === 'function') {
          const __origFetch = window.fetch.bind(window);
          window.fetch = (async function(){
            const args = Array.prototype.slice.call(arguments);
            let method = 'GET'; let url = '';
            try {
              const input = args[0]; const init = args[1] || {};
              if (typeof input === 'string') url = input; else if (input && typeof input.url === 'string') url = input.url;
              if (init && init.method) method = String(init.method).toUpperCase(); else if (input && input.method) method = String(input.method).toUpperCase();
            } catch {}
            const started = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
            try {
              const res = await __origFetch.apply(window, args);
              const finished = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
              const data = { kind: 'network', transport: 'fetch', method, url, status: (res && typeof res.status==='number') ? res.status : 0, ok: !!(res && res.ok), ms: Math.round(finished-started) };
              enqueue({ level: 'info', text: 'NET '+JSON.stringify(data), time: Date.now(), stack: '', source: url });
              return res;
            } catch (err) {
              const finished2 = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
              const data2 = { kind: 'network', transport: 'fetch', method, url, error: (err && (err.message||String(err))) || 'error', ms: Math.round(finished2-started) };
              enqueue({ level: 'error', text: 'NET '+JSON.stringify(data2), time: Date.now(), stack: '', source: url });
              throw err;
            }
          });
        }
      } catch {}
      // XHR interception
      try {
        const captureXHR = (typeof NETWORK.captureXmlHttpRequest === 'boolean') ? NETWORK.captureXmlHttpRequest : true;
        if (captureXHR && typeof window.XMLHttpRequest !== 'undefined') {
          const OrigXHR = window.XMLHttpRequest;
          function WrappedXHR(){
            const xhr = new OrigXHR();
            let method = 'GET'; let url = ''; let start = 0;
            const origOpen = xhr.open;
            xhr.open = function(m,u){ try { method = (m||'GET').toUpperCase(); url = u||''; } catch {} return origOpen.apply(xhr, arguments); };
            const origSend = xhr.send;
            xhr.send = function(){
              start = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
              try {
                xhr.addEventListener('loadend', function(){
                  try {
                    const end = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
                    const status = Number(xhr.status||0); const ok = status>=200 && status<400;
                    const data = { kind: 'network', transport: 'xhr', method, url, status, ok, ms: Math.round(end-start) };
                    enqueue({ level: ok ? 'info' : 'error', text: 'NET '+JSON.stringify(data), time: Date.now(), stack: '', source: url });
                  } catch {}
                }, { once: true });
              } catch {}
              try { return origSend.apply(xhr, arguments); }
              catch (err) {
                const end2 = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
                const dataE = { kind: 'network', transport: 'xhr', method, url, error: (err && (err.message||String(err))) || 'error', ms: Math.round(end2-start) };
                enqueue({ level: 'error', text: 'NET '+JSON.stringify(dataE), time: Date.now(), stack: '', source: url });
                throw err;
              }
            };
            return xhr;
          }
          window.XMLHttpRequest = WrappedXHR;
        }
      } catch {}
    }
  } catch {}
}

// Generate or retrieve a stable per-dev-server id (persisted in-memory)
let __viteDevInstanceId: string | null = null;
function getOrCreateDevId(): string {
  if (__viteDevInstanceId) return __viteDevInstanceId;
  try {
    const a = new Uint8Array(8);
    (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(a);
    __viteDevInstanceId = Array.from(a).map((b) => b.toString(16).padStart(2,'0')).join('');
  } catch {
    __viteDevInstanceId = String(Math.random()).slice(2, 10);
  }
  return __viteDevInstanceId;
}
`;
}
