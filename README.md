### Vite Browser Logs → Terminal (dev-only)

Stream browser `console.*` logs to your Vite dev server terminal with colors, stack traces, batching, and optional file logging.

This is a lightweight Vite plugin designed for SSR/SPA setups (TanStack Start, Nitro, Cloudflare, etc.). It only runs during `vite dev` and has no production impact.

#### Frameworks

| Framework | Dev engine | How to use |
|---|---|---|
| Next.js | Turbopack | [docs/next.md](docs/next.md) |
| Nuxt | Nitro (Vite for client dev) | [docs/nuxt.md](docs/nuxt.md) |
| TanStack Start | Vite | [docs/tanstack.md](docs/tanstack.md) |

## Installation

Using pnpm:

```bash
pnpm add -D vite-browser-logs@latest
```

Using npm:

```bash
npm i -D vite-browser-logs@latest
```

## Setup

### 1) Register the plugin in `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import browserLogsToTerminal from 'vite-browser-logs'

export default defineConfig({
  plugins: [
    // ...other plugins
    browserLogsToTerminal({
      // Optional tuning
      colors: true,
      stackMode: 'condensed', // 'none' | 'condensed' | 'full'
      fileLog: { enabled: true, dir: 'logs/frontend' },
    }),
  ],
})
```

### 2) SSR/TanStack Start: import the virtual module on the client

Add a guarded dev-only dynamic import in your client entry (e.g., `src/router.tsx`):

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-logs-to-terminal')
}
```

That’s it. Start your dev server and open the app:

```bash
pnpm dev
```

Browser logs will appear in your terminal, e.g.:

```
[browser] [a1b2c3d4] ERROR: Something exploded (src/routes/index.tsx:42:13)
    Error: Something exploded
        at doThing (src/routes/index.tsx:42:13)
```

## Options

All options are optional. Defaults are shown.

```ts
type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface BrowserLogsToTerminalOptions {
  enabled?: boolean                 // default: true (dev-only, via apply: 'serve')
  route?: `/${string}`              // default: '/__client-logs'
  include?: BrowserLogLevel[]       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean         // default: true (also keep logging in browser)
  tag?: string                      // default: '[browser]'

  // Stack configuration
  stackMode?: 'none' | 'condensed' | 'full' // default: 'full'
  showSource?: boolean              // default: true (append file:line:col when available)

  colors?: boolean                  // default: true (uses ansis)
  injectHtml?: boolean              // default: true (auto-injects a module <script> in index.html)

  // Client-side batching
  batch?: {
    size?: number                   // default: 20 (flush when queue reaches size)
    interval?: number               // default: 300 ms (flush after interval)
  }

  truncate?: number                 // default: 10_000 (server-side truncate for very long lines)

  // Optional file logging (server-side)
  fileLog?: {
    enabled?: boolean               // default: false
    dir?: string                    // default: 'logs/frontend'
  }
}
```

### Notes
- Stack modes:
  - 'none': no stack output
  - 'condensed': prints only the first stack line
  - 'full': prints the entire stack indented under the log line
- Per-tab session IDs help distinguish multiple browser tabs (`[abcd1234]`).
- Source location extraction prints `(file:line:col)` when available.
- Batching reduces network chatter and uses `sendBeacon` when possible for reliable unloads.

## Examples

### Only warnings and errors, condensed stacks, with file logging

```ts
browserLogsToTerminal({
  injectHtml: false,
  include: ['warn', 'error'],
  stackMode: 'condensed',
  colors: true,
  fileLog: { enabled: true, dir: 'logs/frontend' },
})
```

### Quiet terminal (no browser console duplication)

```ts
browserLogsToTerminal({
  preserveConsole: false,
})
```

### Custom endpoint and tag

```ts
browserLogsToTerminal({
  route: '/__client-logs',
  tag: '[web]'
})
```

## Production builds and stripping logs

This plugin is dev-only (applies to `vite dev` via `apply: 'serve'`). It does not inject any client code into production bundles.

If you want to remove logs from production, you can add a build-only strip step with Rollup’s strip plugin:

```ts
// vite.config.ts
import strip from '@rollup/plugin-strip'

export default defineConfig({
  plugins: [
    // ... your dev plugins
    {
      ...strip({
        include: [/\.([cm]?ts|[jt]sx?)$/],
        // You can be specific: functions: ['console.log', 'console.debug']
        functions: ['console.*'],
      }),
      apply: 'build',
    },
  ],
})
```

## Troubleshooting

- I see GET errors like `virtual:browser-logs-to-terminal net::ERR_FAILED`:
  - If you don’t serve `index.html`, set `injectHtml: false` and import the virtual module on the client as shown above.
- Duplicate logs in the browser:
  - Set `preserveConsole: false` to stop printing in the browser console.
- No colors:
  - Some terminals or CI environments may not render colors; you can set `colors: false`.
- No file logs written:
  - Ensure `fileLog.enabled: true` and the process has write permission to the target `dir` (default `logs/frontend`).

## Security

- The HTTP endpoint is served by the Vite dev server and exists only in development. Nothing is exposed in production.

## License

MIT


