### Nuxt integration (two options)

Nuxt uses Vite in development. You can either:
- Option A (recommended): Use this Vite plugin directly via `nuxt.config.ts` and a small client plugin that imports the virtual module.
- Option B (fallback): Use a Nitro API route plus a client-only plugin that forwards logs manually.

---

### Option A — Use the Vite plugin in Nuxt

1) Add the plugin to `nuxt.config.ts` (disable HTML injection since Nuxt does not serve `index.html`):

```ts
// nuxt.config.ts
import browserLogsToTerminal from 'vite-browser-logs'

export default defineNuxtConfig({
  vite: {
    plugins: [
      browserLogsToTerminal({
        injectHtml: false,
        // optional tuning
        // colors: true,
        // stackMode: 'condensed',
        // fileLog: { enabled: true, dir: 'logs/frontend' },
      }),
    ],
  },
})
```

2) Create a client plugin to import the virtual module in dev:

```ts
// plugins/browser-logs.client.ts
export default defineNuxtPlugin(async () => {
  if (!import.meta.dev) return;
  if (typeof window === 'undefined') return;
  await import('virtual:browser-logs-to-terminal');
});
```

Open your app in dev. Browser console output streams to the terminal used by the Vite dev server.

If you see network errors for the logs endpoint, use Option B instead.

---

### Option B — Nitro API route fallback

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

Open the app. Browser logs will appear in your Nitro dev server terminal.
