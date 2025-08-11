# TanStack Start (Vite) Guide

This uses the Vite provider for the easiest “just works” setup.

## Install

```bash
pnpm add -D @browser-echo/vite
```

## Add the plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [
    react(),
    browserEcho({
      // optional tuning
      colors: true,
      stackMode: 'condensed', // 'none' | 'condensed' | 'full'
      fileLog: { enabled: false }, // Vite-only file logging
    }),
  ],
});
```

### If your app doesn’t serve `index.html`

Some TanStack Start setups render without an `index.html`. In that case, set `injectHtml: false` and import the virtual module once on the client:

```ts
// e.g. src/entry-client.tsx or your router bootstrap
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-echo');
}
```

## Run

```bash
pnpm dev
```

Open your app and watch your terminal show browser logs:

```
[browser] [a1b2c3d4] ERROR: Something exploded (src/routes/index.tsx:42:13)
    Error: Something exploded
        at doThing (src/routes/index.tsx:42:13)
```

## Options that matter for TanStack

* `stackMode: 'condensed'` is a nice balance.
* `fileLog.enabled: true` to write dev logs under `logs/frontend/` (Vite plugin only).
* Keep `preserveConsole: true` if you still want DevTools logs visible.
