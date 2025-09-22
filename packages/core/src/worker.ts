/**
 * Dev-only worker console capture. Safe for Dedicated/Shared/Service Workers.
 * Usage inside worker scope:
 *   importScripts('/path/to/worker.js');
 *   initWorkerEcho({ route: '/__client-logs' });
 */
export function initWorkerEcho(options: { route?: `/${string}`; include?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'>; batch?: { size?: number; interval?: number } } = {}) {
  // @ts-expect-error WorkerGlobalScope
  const selfRef: any = (typeof self !== 'undefined' ? self : undefined);
  if (!selfRef) return;
  if (selfRef.__worker_echo_installed__) return;
  selfRef.__worker_echo_installed__ = true;

  const route = options.route || '/__client-logs';
  const include = options.include || ['log','info','warn','error','debug'];
  const batchSize = options.batch?.size ?? 20;
  const batchInterval = options.batch?.interval ?? 300;
  const session = (() => {
    try { const a = new Uint8Array(8); (selfRef.crypto||crypto).getRandomValues(a); return Array.from(a).map((b) => b.toString(16).padStart(2,'0')).join(''); } catch { return String(Math.random()).slice(2,10); }
  })();

  const queue: any[] = [];
  let timer: any = null;
  function enqueue(entry: any) {
    queue.push(entry);
    if (queue.length >= batchSize) flush(); else if (!timer) timer = setTimeout(flush, batchInterval);
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    const entries = queue.splice(0, queue.length);
    const payload = JSON.stringify({ sessionId: session, entries });
    try { (selfRef.navigator && (selfRef.navigator as any).sendBeacon) ? (selfRef.navigator as any).sendBeacon(route, new Blob([payload], { type: 'application/json' })) : fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true as any, cache: 'no-store' as any }).catch(() => {}); } catch {}
  }

  const ORIGINAL: Record<string, (...args: any[]) => void> = {} as any;
  for (const level of include) {
    const orig = selfRef.console && selfRef.console[level] ? selfRef.console[level].bind(selfRef.console) : (selfRef.console && selfRef.console.log ? selfRef.console.log.bind(selfRef.console) : (() => {}));
    ORIGINAL[level] = orig;
    selfRef.console[level] = (...args: any[]) => {
      try { enqueue({ level, text: args.map((v: any) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { try { return String(v) } catch { return '[Unserializable]' } } }).join(' '), time: Date.now(), tag: '[worker]' }); } catch {}
      try { orig(...args); } catch {}
    };
  }
}


