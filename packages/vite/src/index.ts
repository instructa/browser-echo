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
  fileLog?: { enabled?: boolean; dir?: string; split?: boolean };
  mcp?: { url?: string; routeLogs?: `/${string}`; suppressTerminal?: boolean; headers?: Record<string,string> };
  networkLogs?: {
    enabled?: boolean;
    captureFull?: boolean;
    bodies?: {
      request?: boolean;
      response?: boolean;
      maxBytes?: number;
      allowContentTypes?: string[];
      prettyJson?: boolean;
    };
  };
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
  fileLog: { enabled: false, dir: 'logs/frontend', split: false },
  mcp: { url: '', routeLogs: '/__client-logs', suppressTerminal: true, headers: {}, suppressProvided: false },
  networkLogs: { enabled: true, captureFull: false }
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
  const baseLogDir = options.fileLog.dir;
  const defaultFilePath = joinPath(baseLogDir, `dev-${sessionStamp}.log`);
  if (options.fileLog.enabled && !options.fileLog.split) { try { mkdirSync(dirname(defaultFilePath), { recursive: true }); } catch {} }

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
        if (url && /^(http:\/\/127\.0\.0\.1|http:\/\/localhost)/.test(url)) return { url, route };
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

  // Defer resolution until needed to avoid probing during startup

  server.middlewares.use(options.route, (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: Function) => {
    if (req.method !== 'POST') return next();
    collectBody(req).then(async (raw) => {
      let payload: ClientPayload | null = null;
      try { payload = JSON.parse(raw.toString('utf-8')); }
      catch { res.statusCode = 400; res.end('invalid JSON'); return; }

      if (!payload || !Array.isArray(payload.entries)) { res.statusCode = 400; res.end('invalid payload'); return; }

      // Mirror to MCP server if configured
      let targetIngest = resolvedIngest || '';
      if (!targetIngest) {
        // Only attempt discovery when configured explicitly via .browser-echo-mcp.json
        // Avoid probing default dev ports implicitly
        try { await resolveOnce(); } catch {}
        targetIngest = resolvedIngest || '';
      }
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
        const tag = entry.tag || options.tag;
        const truncated = typeof entry.text === 'string' && entry.text.length > options.truncate
          ? entry.text.slice(0, options.truncate) + '... (truncated)'
          : entry.text;
        let line = `${tag} [${sid}] ${level.toUpperCase()}: ${truncated}`;
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
          if (entry.stack && options.stackMode !== 'none') {
            const stackLines = options.stackMode === 'full'
              ? indent(entry.stack, '    ')
              : `    ${(String(entry.stack).split(/\r?\n/g).find((l) => l.trim().length > 0) || '').trim()}`;
            toFile.push(stackLines);
          }
          let outPath = defaultFilePath;
          if (options.fileLog.split) {
            const tagKey = String(tag || '[browser]').replace(/^[\[]|[\]]$/g, '').toLowerCase().replace(/\s+/g, '-');
            outPath = joinPath(baseLogDir, tagKey, `dev-${sessionStamp}.log`);
            try { mkdirSync(dirname(outPath), { recursive: true }); } catch {}
          }
          try { appendFileSync(outPath, toFile.join('\n') + '\n'); } catch {}
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

type ClientPayload = { sessionId?: string; entries: Array<{ level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; tag?: string; }>; };

function makeClientModule(options: Required<BrowserLogsToTerminalOptions>) {
  const include = JSON.stringify(options.include);
  const preserve = JSON.stringify(options.preserveConsole);
  const route = JSON.stringify(options.route);
  const tag = JSON.stringify(options.tag);
  const batchSize = String(options.batch?.size ?? 20);
  const batchInterval = String(options.batch?.interval ?? 300);
  const netEnabled = !!options.networkLogs?.enabled;
  const netFull = !!options.networkLogs?.captureFull;
  const bodies = options.networkLogs?.bodies || {};
  const bodyReq = !!bodies.request;
  const bodyRes = !!bodies.response;
  const bodyMax = Number(bodies.maxBytes ?? 2048) | 0;
  const bodyPretty = bodies.prettyJson !== false;
  const bodyAllow = Array.isArray(bodies.allowContentTypes) && bodies.allowContentTypes.length ? bodies.allowContentTypes : ['application/json','text/','application/x-www-form-urlencoded'];
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
  const NET_ENABLED = ${JSON.stringify(netEnabled)};
  const NET_FULL = ${JSON.stringify(netFull)};
  const NET_BODY_REQ = ${JSON.stringify(bodyReq)};
  const NET_BODY_RES = ${JSON.stringify(bodyRes)};
  const NET_BODY_MAX = ${JSON.stringify(bodyMax)} | 0;
  const NET_BODY_PRETTY = ${JSON.stringify(bodyPretty)};
  const NET_BODY_ALLOW = ${JSON.stringify(bodyAllow)};
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
  function normUrlStr(input){ try { if(typeof input==='string') return input; if (input && typeof input.url==='string') return input.url; if (input && input.href) return String(input.href||''); return '' } catch { return '' } }
  if (NET_ENABLED) {
    try {
      const __origFetch = window.fetch && window.fetch.bind(window);
      if (__origFetch) {
        window.fetch = function(input, init){
          const start = performance.now();
          const method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
          const u = normUrlStr(input);
          function baseLine(status, dur){ const st = isFinite(status) ? String(status) : 'ERR'; return '[NETWORK] ['+method+'] ['+(u||'(request)')+'] ['+st+'] ['+dur+'ms]'; }
          function getHeader(headers, name){ try{ if(!headers) return ''; var key=String(name).toLowerCase(); if (headers.get) { var v=headers.get(name)||headers.get(key)||''; return String(v||'').toLowerCase(); } if (Array.isArray(headers)) { for (var i=0;i<headers.length;i++){ var kv=headers[i]; if (String(kv[0]).toLowerCase()===key) return String(kv[1]||'').toLowerCase(); } } if (typeof headers==='object'){ for (var k in headers){ if (k.toLowerCase()===key) return String(headers[k]||'').toLowerCase(); } } } catch{} return '' }
          function isAllowed(ct){ try{ var c=String(ct||'').toLowerCase(); if(!c) return false; for (var i=0;i<NET_BODY_ALLOW.length;i++){ var al=String(NET_BODY_ALLOW[i]); if (c.startsWith(al)) return true; } } catch{} return false }
          function isLikelyText(s){ var t=String(s||'').trim(); if(!t) return true; if(t[0]==='{'||t[0]==='[') return true; return /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(t) }
          function formatSnippet(raw, ct){ try{ var text=String(raw||''); var lct=String(ct||'').toLowerCase(); if (NET_BODY_PRETTY && (lct.startsWith('application/json') || text.trim().startsWith('{') || text.trim().startsWith('['))) { try { text = JSON.stringify(JSON.parse(text), null, 2) } catch {} } var enc=new TextEncoder(); var bytes=enc.encode(text); if (bytes.length <= NET_BODY_MAX) return text; var sliced=bytes.slice(0, Math.max(0, NET_BODY_MAX)); var dec=new TextDecoder(); var shown=dec.decode(sliced); var extra=bytes.length - sliced.length; return shown+'... (+'+extra+' bytes)'; } catch { return '' } }
          function reqSnippet(){ if(!NET_BODY_REQ) return Promise.resolve(''); try{ if (input && typeof input==='object' && input.clone) { var req=input; var headers=req.headers && req.headers.get ? req.headers : null; var ct=getHeader(headers,'content-type') || (init && init.headers ? getHeader(init.headers,'content-type') : ''); if (!isAllowed(ct)) return Promise.resolve(''); return req.clone().text().then(function(txt){ return formatSnippet(txt, ct) }); } var ct2 = init && init.headers ? getHeader(init.headers,'content-type') : ''; var body = init && init.body; if (typeof body==='string') { if (!ct2 || isAllowed(ct2) || isLikelyText(body)) return Promise.resolve(formatSnippet(body, ct2)); } else if (body && body.toString && (body instanceof URLSearchParams)) { var s = body.toString(); var reqCt = ct2 || 'application/x-www-form-urlencoded'; if (isAllowed(reqCt)) return Promise.resolve(formatSnippet(s, reqCt)); } else if (body && typeof body.size==='number') { var size = Number(body.size)|0; return Promise.resolve('[binary: '+size+' bytes]'); } } catch {} return Promise.resolve('') }
          function resSnippet(res){ if(!NET_BODY_RES) return Promise.resolve(''); try{ var ct=getHeader(res && res.headers, 'content-type'); if (!isAllowed(ct)) return Promise.resolve(''); if (res && res.clone) { try { var clone=res.clone(); return clone.text().then(function(txt){ return formatSnippet(txt, ct) }); } catch {} } } catch {} return Promise.resolve('') }
          try {
            const p = __origFetch(input, init);
            return Promise.resolve(p).then(function(res){ var dur=Math.max(0, Math.round(performance.now()-start)); var st=Number(res && res.status || 0)|0; var ok=!!(res && res.ok); var extra = NET_FULL ? (' [size:' + (Number(res && res.headers && res.headers.get && res.headers.get('content-length') || 0) | 0) + ']') : ''; Promise.all([reqSnippet(), resSnippet(res)]).then(function(arr){ var reqS=arr[0], resS=arr[1]; var line = baseLine(st, dur) + extra; if (reqS) line += '\n    req: ' + reqS; if (resS) line += '\n    res: ' + resS; enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); }).catch(function(){ var line=baseLine(st, dur) + extra; enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); }); return res; }).catch(function(err){ var dur=Math.max(0, Math.round(performance.now()-start)); reqSnippet().then(function(reqS){ var line = baseLine(0, dur) + ' fetch failed'; if (reqS) line += '\n    req: ' + reqS; enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' }); }).catch(function(){ var line=baseLine(0, dur) + ' fetch failed'; enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' }); }); throw err; });
          } catch (err) {
            var dur2 = Math.max(0, Math.round(performance.now()-start));
            var line2 = baseLine(0, dur2) + ' fetch failed';
            enqueue({ level: 'warn', text: line2, time: Date.now(), tag: '[network]' });
            throw err;
          }
        }
      }
    } catch {}
    try {
      const XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype) {
        const _open = XHR.prototype.open, _send = XHR.prototype.send;
        XHR.prototype.open = function(method, url){ try{ this.__be_method__ = String(method||'GET').toUpperCase() }catch{} try{ this.__be_url__ = String(url||'') }catch{} return _open.apply(this, arguments); };
        XHR.prototype.send = function(){ const start = performance.now(); const onEnd = ()=>{ try{ const dur = Math.max(0, Math.round(performance.now()-start)); const method = this.__be_method__ || 'GET'; const u = this.__be_url__ || ''; const status = Number(this.status||0)|0; const ok = status >= 200 && status < 400; const extra = NET_FULL ? ('ready:'+this.readyState) : ''; const line = '[NETWORK] ['+method+'] ['+u+'] ['+(status||'ERR')+'] ['+dur+'ms]'+(extra?(' '+extra):''); enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); } catch {} try { this.removeEventListener('loadend', onEnd); this.removeEventListener('error', onEnd); this.removeEventListener('abort', onEnd); } catch {} };
          try { this.addEventListener('loadend', onEnd); } catch {}
          try { this.addEventListener('error', onEnd); } catch {}
          try { this.addEventListener('abort', onEnd); } catch {}
          return _send.apply(this, arguments);
        }
      }
    } catch {}
    try {
      const WS = window.WebSocket;
      if (WS) {
        // @ts-ignore
        window.WebSocket = new Proxy(WS, {
          construct(Target, args) {
            const url = normUrlStr(args?.[0]);
            const start = performance.now();
            // @ts-ignore
            const socket = new Target(...args);
            try {
              socket.addEventListener('open', () => {
                const dur = Math.max(0, Math.round(performance.now() - start));
                const line = '[NETWORK] [WS OPEN] ['+(url||'(ws)')+'] ['+dur+'ms]';
                enqueue({ level: 'info', text: line, time: Date.now(), tag: '[network]' });
              });
              socket.addEventListener('close', (ev) => {
                const dur = Math.max(0, Math.round(performance.now() - start));
                const code = Number(ev && ev.code || 0) | 0;
                const reason = ev && ev.reason ? String(ev.reason) : '';
                const extra = reason ? ('code:'+code+' reason:'+reason) : ('code:'+code);
                const line = '[NETWORK] [WS CLOSE] ['+(url||'(ws)')+'] ['+dur+'ms] '+extra;
                enqueue({ level: code === 1000 ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' });
              });
              socket.addEventListener('error', () => {
                const dur = Math.max(0, Math.round(performance.now() - start));
                const line = '[NETWORK] [WS ERROR] ['+(url||'(ws)')+'] ['+dur+'ms]';
                enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' });
              });
            } catch {}
            return socket;
          }
        });
      }
    } catch {}
  }
}
`;
}
