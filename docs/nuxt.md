# Nuxt 3/4 Guide

The Nuxt provider registers a Nitro server route and a client plugin (dev‑only). No manual wiring beyond adding the module.

## Install

```bash
pnpm add -D @browser-echo/nuxt
```

## Enable the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@browser-echo/nuxt'],
  // optional:
  // browserEcho: {
  //   route: '/__client-logs',
  //   include: ['warn', 'error'],
  //   tag: '[web]',
  //   batch: { size: 20, interval: 300 },
  //   preserveConsole: true,
  //   stackMode: 'condensed', // 'full' | 'condensed' | 'none'
  // }
});
```

That’s it. Run `nuxi dev` and open the app—your server terminal will show browser logs.

### Notes

* Nuxt sometimes proxies Vite during dev; we avoid that by registering a Nitro route directly at `route` (default `/__client-logs`).
* If you run a custom reverse proxy, ensure this route remains same‑origin and not behind auth in dev.
* `stackMode` controls how much of the stack trace is forwarded:
  * `full` (default): send full filtered stack
  * `condensed`: send only the top application frame
  * `none`: do not send any stack frames
* After changing `browserEcho` options, restart the Nuxt dev server to regenerate the client plugin.
