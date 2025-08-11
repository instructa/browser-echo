### Nuxt (Nitro) integration

Use a Nitro API route to receive logs and a client-only plugin to forward console output. Dev-only.

1) Create `server/api/__client-logs.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const body = await readBody<{ entries?: { level?: string; text?: string }[]; level?: string; text?: string } | null>(event);
  const valid = new Set(['log','info','warn','error','debug']);
  const out = (lvl: string, line: string) => ((console as any)[lvl] || console.log)(line);
  if (!body) return new Response('invalid', { status: 400 }) as any;

  if (Array.isArray(body.entries)) {
    for (const e of body.entries) {
      const lvl = valid.has(String(e.level)) ? String(e.level) : 'log';
      out(lvl, `[browser] ${lvl.toUpperCase()}: ${e.text ?? ''}`);
    }
    return new Response(null, { status: 204 }) as any;
  }

  const lvl = valid.has(String(body.level)) ? String(body.level) : 'log';
  out(lvl, `[browser] ${lvl.toUpperCase()}: ${body.text ?? ''}`);
  return new Response(null, { status: 204 }) as any;
});
```

2) Create `plugins/dev-logs.client.ts`

```ts
export default defineNuxtPlugin(() => {
  if (process.dev !== true) return;
  const levels = ['log','info','warn','error','debug'] as const;
  const originals: any = {};
  const safe = (v: unknown) => {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { try { return String(v); } catch { return '[Unserializable]'; } }
  };
  const send = (level: string, text: string) => {
    const payload = JSON.stringify({ level, text });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/__client-logs', new Blob([payload], { type: 'application/json' }));
      else void fetch('/api/__client-logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true, cache: 'no-store' });
    } catch {}
  };
  for (const level of levels) {
    const orig = (console as any)[level]?.bind(console) || console.log.bind(console);
    originals[level] = orig;
    (console as any)[level] = (...args: unknown[]) => { send(level, args.map(safe).join(' ')); try { orig(...args); } catch {} };
  }
});
```

That’s it. Nuxt auto-loads client plugins. Open the app and check your terminal.
