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
      const emit = (status: number, ok: boolean, extra?: string) => {
        const dur = Math.max(0, Math.round(performance.now() - start));
        const statusText = isFinite(status as any) ? String(status) : 'ERR';
        const text = `[NETWORK] [${method}] [${url || '(request)'}] [${statusText}] [${dur}ms]${extra ? ' ' + extra : ''}`;
        enqueue({ level: ok ? 'info' : 'warn', text, time: Date.now(), tag: '[network]' });
      };
      try {
        const p = orig(input, init);
        return Promise.resolve(p).then((res: any) => {
          try {
            if (networkFull) {
              const headers: any = {};
              try { res.headers && res.headers.forEach && res.headers.forEach((v: string, k: string) => { headers[k] = v; }); } catch {}
              emit(Number(res?.status ?? 0) | 0, !!res?.ok, `[size:${Number(res?.headers?.get?.('content-length') || 0) | 0}]`);
            } else {
              emit(Number(res?.status ?? 0) | 0, !!res?.ok);
            }
          } catch {}
          return res;
        }).catch((err: any) => {
          emit(0, false, err?.message ? String(err.message) : 'fetch failed');
          throw err;
        });
      } catch (err: any) {
        emit(0, false, err?.message ? String(err.message) : 'fetch failed');
        throw err;
      }
    };
  }

  function installXhrCapture() {
    const XHR = (window as any).XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function(method: string, url: string) {
      try { (this as any).__be_method__ = String(method || 'GET').toUpperCase(); } catch {}
      try { (this as any).__be_url__ = String(url || ''); } catch {}
      return origOpen.apply(this, arguments as any);
    } as any;
    XHR.prototype.send = function() {
      const start = performance.now();
      const onEnd = () => {
        try {
          const dur = Math.max(0, Math.round(performance.now() - start));
          const method = (this as any).__be_method__ || 'GET';
          const u = (this as any).__be_url__ || '';
          const status = Number((this as any).status ?? 0) | 0;
          const ok = status >= 200 && status < 400;
          const extra = networkFull ? `ready:${(this as any).readyState}` : '';
          const text = `[NETWORK] [${method}] [${u}] [${status || 'ERR'}] [${dur}ms]${extra ? ' ' + extra : ''}`;
          enqueue({ level: ok ? 'info' : 'warn', text, time: Date.now(), tag: '[network]' });
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
