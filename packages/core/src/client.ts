import type { BrowserLogLevel, InitBrowserEchoOptions } from './types';

export function initBrowserEcho(opts: InitBrowserEchoOptions = {}) {
  if (typeof window === 'undefined') return;

  const w = window as any;
  if (w.__browser_echo_installed__) return;
  w.__browser_echo_installed__ = true;

  const route = opts.route ?? '/__client-logs';
  const include: BrowserLogLevel[] =
    opts.include ?? ['log', 'info', 'warn', 'error', 'debug'];
  const preserveConsole = opts.preserveConsole ?? true;
  const tag = opts.tag ?? '[browser]';
  const batchSize = opts.batch?.size ?? 20;
  const batchInterval = opts.batch?.interval ?? 300;

  const session = randomId();
  const queue: any[] = [];
  let timer: any = null;

  const ORIGINAL: Record<string, (...a: any[]) => void> = {};
  for (const level of include) {
    const orig = (console as any)[level]
      ? (console as any)[level].bind(console)
      : console.log.bind(console);
    ORIGINAL[level] = orig;
    (console as any)[level] = (...args: any[]) => {
      const { text, stack, source } = formatForWire(level, args);
      enqueue({ level, text, time: Date.now(), stack, source });
      if (preserveConsole) {
        try { orig(...args); } catch {}
      }
    };
  }

  try {
    ORIGINAL['info']?.(`${tag} forwarding console logs to ${route} (session ${session})`);
  } catch {}

  // Optional: network capture (fetch + XHR)
  const networkEnabled = !!opts.networkLogs?.enabled;
  const networkFull = !!opts.networkLogs?.captureFull;
  const bodiesCfg = opts.networkLogs?.bodies || {};
  const bodyReqEnabled = !!bodiesCfg.request;
  const bodyResEnabled = !!bodiesCfg.response;
  const bodyMaxBytes = (bodiesCfg.maxBytes ?? 2048) | 0;
  const bodyPrettyJson = bodiesCfg.prettyJson !== false;
  const bodyAllowed: string[] = (Array.isArray(bodiesCfg.allowContentTypes) && bodiesCfg.allowContentTypes.length)
    ? bodiesCfg.allowContentTypes.map((s) => String(s).toLowerCase())
    : ['application/json', 'text/', 'application/x-www-form-urlencoded'];
  if (networkEnabled) {
    try { installFetchCapture(); } catch {}
    try { installXhrCapture(); } catch {}
    try { installWebSocketCapture(); } catch {}
  }

  function enqueue(entry: any) {
    queue.push(entry);
    if (queue.length >= batchSize) flush();
    else if (!timer) timer = setTimeout(flush, batchInterval);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;

    const entries = queue.splice(0, queue.length);
    const payload = JSON.stringify({ sessionId: session, entries });

    try {
      if ('sendBeacon' in navigator) {
        const blob = new Blob([payload], { type: 'application/json' });
        (navigator as any).sendBeacon(route, blob);
      } else {
        fetch(route, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          credentials: 'omit',
          keepalive: true,
          cache: 'no-store',
        }).catch(() => void 0);
      }
    } catch {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);

  function formatForWire(_level: string, args: any[]) {
    const text = args.map(safeFormat).join(' ');
    const stack = captureStack(opts.stackMode ?? 'condensed');
    const source = parseSource(stack);
    return { text, stack, source };
  }

  function safeFormat(val: any): string {
    if (typeof val === 'string') return val;
    if (val instanceof Error) return `${val.name || 'Error'}: ${val.message || ''}`;
    try {
      const seen = new WeakSet();
      return JSON.stringify(val, (k, v) => {
        if (typeof v === 'bigint') return String(v) + 'n';
        if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        if (typeof v === 'symbol') return v.toString();
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
    } catch {
      try { return String(val); } catch { return '[Unserializable]'; }
    }
  }

  function captureStack(mode: 'full' | 'condensed' | 'none'): string {
    if (mode === 'none') return '';
    try {
      const e = new Error();
      const lines = (e.stack || '').split('\n').slice(1);
      const isInternal = (l: string) =>
        /initBrowserEcho|browser-echo|captureStack|safeFormat|enqueue|flush/.test(l);
      const appLines = lines.filter((l) => !isInternal(l));
      if (mode === 'condensed') return appLines[0] ? appLines[0] : '';
      return appLines.join('\n');
    } catch { return ''; }
  }

  function parseSource(stack: string): string {
    if (!stack) return '';
    const m = stack.match(/\(?((?:file:\/\/|https?:\/\/|\/)[^) \n]+):(\d+):(\d+)\)?/);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : '';
  }

  function normalizeUrlString(input: any): string {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;
      if (input instanceof URL) return input.toString();
      return '';
    } catch { return ''; }
  }

  function installFetchCapture() {
    const orig = (window as any).fetch?.bind(window);
    if (!orig) return;
    (window as any).fetch = (input: any, init?: any) => {
      const start = performance.now();
      const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
      const url = normalizeUrlString(input);
      const baseLine = (status: number, durMs: number) => {
        const statusText = isFinite(status as any) ? String(status) : 'ERR';
        return `[NETWORK] [${method}] [${url || '(request)'}] [${statusText}] [${durMs}ms]`;
      };
      const getReqSnippet = (): Promise<string> => {
        if (!bodyReqEnabled) return Promise.resolve('');
        try {
          // Prefer Request.clone() if available
          if (input && typeof input === 'object' && typeof (input as any).clone === 'function') {
            const req: any = input;
            const headers = (req.headers && typeof req.headers.get === 'function') ? req.headers : null;
            const ct = getHeader(headers, 'content-type') || (init?.headers ? getHeader(init?.headers, 'content-type') : '');
            if (!isAllowedContentType(ct)) return Promise.resolve('');
            return req.clone().text().then((txt: string) => formatBodySnippet(txt, ct));
          }
          // Fallback to init.body as string/urlencoded
          const ct = init?.headers ? getHeader(init.headers, 'content-type') : '';
          const body = init?.body;
          if (typeof body === 'string') {
            if (!ct || isAllowedContentType(ct) || isLikelyText(body)) return Promise.resolve(formatBodySnippet(body, ct));
          } else if (body && typeof (body as any).toString === 'function' && (body instanceof URLSearchParams)) {
            const s = (body as URLSearchParams).toString();
            const reqCt = ct || 'application/x-www-form-urlencoded';
            if (isAllowedContentType(reqCt)) return Promise.resolve(formatBodySnippet(s, reqCt));
          } else if (body && typeof (body as any).size === 'number') {
            const size = Number((body as any).size) | 0;
            return Promise.resolve(`[binary: ${size} bytes]`);
          }
        } catch {}
        return Promise.resolve('');
      };
      const getResSnippet = (res: any): Promise<string> => {
        if (!bodyResEnabled) return Promise.resolve('');
        try {
          const headers = res?.headers;
          const ct = getHeader(headers, 'content-type');
          if (!isAllowedContentType(ct)) return Promise.resolve('');
          if (res && typeof res.clone === 'function') {
            try {
              const clone = res.clone();
              if (clone && clone.body && typeof clone.body.getReader === 'function') {
                return readStreamSnippet(clone, ct);
              }
              return clone.text().then((txt: string) => formatBodySnippet(txt, ct));
            } catch {}
          }
        } catch {}
        return Promise.resolve('');
      };
      try {
        const p = orig(input, init);
        return Promise.resolve(p).then((res: any) => {
          const dur = Math.max(0, Math.round(performance.now() - start));
          const statusNum = Number(res?.status ?? 0) | 0;
          const ok = !!res?.ok;
          const extra = networkFull ? ` [size:${Number(res?.headers?.get?.('content-length') || 0) | 0}]` : '';
          // Prepare body snippets asynchronously
          Promise.all([getReqSnippet(), getResSnippet(res)]).then(([reqS, resS]) => {
            let line = baseLine(statusNum, dur) + extra;
            if (reqS) line += `\n    req: ${reqS}`;
            if (resS) line += `\n    res: ${resS}`;
            enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' });
          }).catch(() => {
            const line = baseLine(statusNum, dur) + extra;
            enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' });
          });
          return res;
        }).catch((err: any) => {
          const dur = Math.max(0, Math.round(performance.now() - start));
          Promise.resolve(getReqSnippet()).then((reqS) => {
            let line = baseLine(0, dur);
            line += ` fetch failed`;
            if (reqS) line += `\n    req: ${reqS}`;
            enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' });
          }).catch(() => {
            const line = baseLine(0, dur) + ' fetch failed';
            enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' });
          });
          throw err;
        });
      } catch (err: any) {
        const dur = Math.max(0, Math.round(performance.now() - start));
        let line = baseLine(0, dur) + ' fetch failed';
        enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' });
        throw err;
      }
    };
  }

  function installXhrCapture() {
    const XHR = (window as any).XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    const origSetHeader = XHR.prototype.setRequestHeader;
    XHR.prototype.open = function(method: string, url: string) {
      try { (this as any).__be_method__ = String(method || 'GET').toUpperCase(); } catch {}
      try { (this as any).__be_url__ = String(url || ''); } catch {}
      return origOpen.apply(this, arguments as any);
    } as any;
    if (origSetHeader) {
      XHR.prototype.setRequestHeader = function(name: string, value: string) {
        try {
          const k = String(name || '').toLowerCase();
          if (k === 'content-type') { (this as any).__be_req_ct__ = String(value || ''); }
        } catch {}
        return origSetHeader.apply(this, arguments as any);
      } as any;
    }
    XHR.prototype.send = function() {
      const start = performance.now();
      try { if (bodyReqEnabled) { (this as any).__be_req_body__ = arguments && arguments[0]; } } catch {}
      const onEnd = () => {
        try {
          const dur = Math.max(0, Math.round(performance.now() - start));
          const method = (this as any).__be_method__ || 'GET';
          const u = (this as any).__be_url__ || '';
          const status = Number((this as any).status ?? 0) | 0;
          const ok = status >= 200 && status < 400;
          const extra = networkFull ? ` ready:${(this as any).readyState}` : '';
          let line = `[NETWORK] [${method}] [${u}] [${status || 'ERR'}] [${dur}ms]${extra}`;
          // Bodies
          if (bodyReqEnabled) {
            try {
              const reqCt = String((this as any).__be_req_ct__ || '').toLowerCase();
              const reqBody = (this as any).__be_req_body__;
              const reqSnippet = formatRequestBodySync(reqBody, reqCt);
              if (reqSnippet) line += `\n    req: ${reqSnippet}`;
            } catch {}
          }
          if (bodyResEnabled) {
            try {
              const resCt = String((this as any).getResponseHeader?.('Content-Type') || '').toLowerCase();
              if (isAllowedContentType(resCt)) {
                let snippet = '';
                const rt = (this as any).responseType;
                if (!rt || rt === 'text') {
                  try { snippet = formatBodySnippet(String((this as any).responseText || ''), resCt); } catch {}
                } else if (rt === 'json') {
                  try { snippet = formatBodySnippet(JSON.stringify((this as any).response ?? null), 'application/json'); } catch {}
                }
                if (snippet) line += `\n    res: ${snippet}`;
              }
            } catch {}
          }
          enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' });
        } catch {}
        try {
          this.removeEventListener('loadend', onEnd);
          this.removeEventListener('error', onEnd);
          this.removeEventListener('abort', onEnd);
        } catch {}
      };
      try { this.addEventListener('loadend', onEnd); } catch {}
      try { this.addEventListener('error', onEnd); } catch {}
      try { this.addEventListener('abort', onEnd); } catch {}
      return origSend.apply(this, arguments as any);
    } as any;
  }

  function installWebSocketCapture() {
    const WS = (window as any).WebSocket;
    if (!WS) return;
    (window as any).WebSocket = new Proxy(WS, {
      construct(Target: any, args: any[]) {
        const url = normalizeUrlString(args?.[0]);
        const start = performance.now();
        const socket = new Target(...args);
        try {
          socket.addEventListener('open', () => {
            const dur = Math.max(0, Math.round(performance.now() - start));
            const text = `[NETWORK] [WS OPEN] [${url || '(ws)'}] [${dur}ms]`;
            enqueue({ level: 'info', text, time: Date.now(), tag: '[network]' });
          });
          socket.addEventListener('close', (ev: any) => {
            const dur = Math.max(0, Math.round(performance.now() - start));
            const code = Number(ev?.code ?? 0) | 0;
            const reason = ev?.reason ? String(ev.reason) : '';
            const extra = reason ? `code:${code} reason:${reason}` : `code:${code}`;
            const text = `[NETWORK] [WS CLOSE] [${url || '(ws)'}] [${dur}ms] ${extra}`;
            enqueue({ level: code === 1000 ? 'info' : 'warn', text, time: Date.now(), tag: '[network]' });
          });
          socket.addEventListener('error', () => {
            const dur = Math.max(0, Math.round(performance.now() - start));
            const text = `[NETWORK] [WS ERROR] [${url || '(ws)'}] [${dur}ms]`;
            enqueue({ level: 'warn', text, time: Date.now(), tag: '[network]' });
          });
        } catch {}
        return socket;
      }
    });
  }

  function getHeader(headers: any, name: string): string {
    try {
      if (!headers) return '';
      const key = String(name).toLowerCase();
      if (typeof headers.get === 'function') {
        const v = headers.get(name) || headers.get(key) || '';
        return String(v || '').toLowerCase();
      }
      if (Array.isArray(headers)) {
        for (const [k, v] of headers) {
          if (String(k).toLowerCase() === key) return String(v || '').toLowerCase();
        }
      }
      if (typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === key) return String((headers as any)[k] || '').toLowerCase();
        }
      }
    } catch {}
    return '';
  }

  function isAllowedContentType(ct: string): boolean {
    try {
      const c = String(ct || '').toLowerCase();
      if (!c) return false;
      for (const a of bodyAllowed) {
        const al = String(a);
        if (c.startsWith(al)) return true;
      }
    } catch {}
    return false;
  }

  function isLikelyText(s: string): boolean {
    const trimmed = String(s || '').trim();
    if (!trimmed) return true;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
    return /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(trimmed);
  }

  function formatBodySnippet(raw: string, contentType: string): string {
    try {
      let text = String(raw ?? '');
      const ct = String(contentType || '').toLowerCase();
      if (bodyPrettyJson && (ct.startsWith('application/json') || (text.trim().startsWith('{') || text.trim().startsWith('[')))) {
        try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      }
      const enc = new TextEncoder();
      const bytes = enc.encode(text);
      if (bytes.length <= bodyMaxBytes) return text;
      const sliced = bytes.slice(0, Math.max(0, bodyMaxBytes));
      const dec = new TextDecoder();
      const shown = dec.decode(sliced);
      const extra = bytes.length - sliced.length;
      return `${shown}… (+${extra} bytes)`;
    } catch { return ''; }
  }

  function formatRequestBodySync(body: any, contentType: string): string {
    try {
      const ct = String(contentType || '').toLowerCase();
      if (!ct || !isAllowedContentType(ct)) {
        if (typeof body === 'string' && isLikelyText(body)) return formatBodySnippet(body, '');
        return '';
      }
      if (typeof body === 'string') return formatBodySnippet(body, ct);
      if (body instanceof URLSearchParams) return formatBodySnippet(body.toString(), 'application/x-www-form-urlencoded');
      if (body && typeof body.size === 'number') return `[binary: ${Number(body.size) | 0} bytes]`;
    } catch {}
    return '';
  }

  async function readStreamSnippet(resClone: any, contentType: string): Promise<string> {
    try {
      const reader = resClone.body?.getReader?.();
      if (!reader) return resClone.text().then((t: string) => formatBodySnippet(t, contentType));
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const v = value as Uint8Array;
          if (received < bodyMaxBytes) {
            const need = bodyMaxBytes - received;
            chunks.push(need >= v.length ? v : v.slice(0, need));
          }
          received += v.length;
          if (received >= bodyMaxBytes) {
            try { reader.cancel && reader.cancel(); } catch {}
            break;
          }
        }
      }
      const merged = mergeUint8Arrays(chunks);
      const dec = new TextDecoder();
      const shown = dec.decode(merged);
      if (received <= bodyMaxBytes) return formatBodySnippet(shown, contentType);
      const extra = received - merged.length;
      return `${shown}… (+${extra} bytes)`;
    } catch {
      try { const t = await resClone.text(); return formatBodySnippet(t, contentType); } catch { return ''; }
    }
  }

  function mergeUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  function randomId() {
    try {
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return String(Math.random()).slice(2, 10);
    }
  }
}
