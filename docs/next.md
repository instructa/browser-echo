### Next.js (Turbopack) integration

Next dev doesn’t run Vite, so use a tiny API route + client helper. Dev-only, no deps.

1) Create `src/app/api/__client-logs/route.ts`

```ts
export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try { body = await req.json(); } catch { return new Response('invalid', { status: 400 }); }

  const valid = new Set(['log','info','warn','error','debug']);
  const out = (lvl: string, line: string) => ((console as any)[lvl] || console.log)(line);

  type Entry = { level?: string; text?: string };
  const b = body as { entries?: Entry[] } & Entry;

  if (Array.isArray(b.entries)) {
    for (const e of b.entries) {
      const lvl = valid.has(String(e.level)) ? String(e.level) : 'log';
      out(lvl, `[browser] ${lvl.toUpperCase()}: ${e.text ?? ''}`);
    }
    return new Response(null, { status: 204 });
  }

  const lvl = valid.has(String(b.level)) ? String(b.level) : 'log';
  out(lvl, `[browser] ${lvl.toUpperCase()}: ${b.text ?? ''}`);
  return new Response(null, { status: 204 });
}
```

2) Create `src/app/dev-logs.tsx`

```tsx
"use client";
import { useEffect } from "react";
export default function DevLogs() {
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;
    const levels = ['log','info','warn','error','debug'] as const;
    const originals: any = {};
    const safe = (v: unknown) => {
      if (typeof v === 'string') return v;
      if (v instanceof Error) return `${v.name || 'Error'}: ${v.message || ''}`;
      try { const s = new WeakSet<object>(); return JSON.stringify(v, (k, val) => {
        if (typeof val === 'bigint') return String(val) + 'n';
        if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
        if (val instanceof Error) return { name: val.name, message: val.message };
        if (typeof val === 'symbol') return String(val);
        if (val && typeof val === 'object') { if (s.has(val)) return '[Circular]'; s.add(val); }
        return val;
      }); } catch { try { return String(v); } catch { return '[Unserializable]'; } }
    };
    const send = (level: string, text: string) => {
      const payload = JSON.stringify({ level, text });
      try {
        if (navigator.sendBeacon) navigator.sendBeacon('/api/__client-logs', new Blob([payload], { type: 'application/json' }));
        else void fetch('/api/__client-logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true, cache: 'no-store' });
      } catch {}
    };
    for (const level of levels) {
      const orig = (console[level] || console.log).bind(console);
      originals[level] = orig;
      console[level] = (...args: unknown[]) => { send(level, args.map(safe).join(' ')); try { orig(...args); } catch {} } as any;
    }
    return () => { for (const level of levels) if (originals[level]) console[level] = originals[level]; };
  }, []);
  return null;
}
```

3) Include once in `src/app/layout.tsx`

```tsx
import DevLogs from './dev-logs';
// ...
<body>
  <DevLogs />
  {children}
</body>
```

Open the app, browser console output will stream to your Next dev terminal.
