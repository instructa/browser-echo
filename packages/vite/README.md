# @browser-echo/vite

Vite plugin for streaming browser console logs to your dev terminal with colors, stack traces, and optional file logging.

This package provides a Vite plugin that includes dev middleware and a virtual module to forward browser console logs to your terminal during development. Works with React, Vue, TanStack Start, and any Vite-based project.

## Table of Contents

- [Vue + Vite](#vue--vite)
- [React + Vite](#react--vite)
- [TanStack Start](#tanstack-start)
- [Configuration Options](#configuration-options)

## Features

- Vite plugin with built-in dev middleware
- Virtual module for automatic client initialization
- Optional file logging (unique to Vite provider)
- Colorized terminal output
- Full stack trace support with multiple modes
- Works with `index.html` or server-side rendered apps

## Installation

```bash
npm install -D @browser-echo/vite
# or
pnpm add -D @browser-echo/vite
```

## Usage Examples

### Vue + Vite

```bash
npm install -D @browser-echo/vite
# or
pnpm add -D @browser-echo/vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [
    vue(),
    browserEcho({
      // Optional configuration
      stackMode: 'condensed',
      colors: true,
    }),
  ],
});
```

That's it! Your Vue app will now stream console logs to your terminal during development.

### React + Vite

```bash
npm install -D @browser-echo/vite
# or
pnpm add -D @browser-echo/vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [
    react(),
    browserEcho({
      // Optional configuration
      stackMode: 'condensed',
      colors: true,
    }),
  ],
});
```

Your React app will now stream console logs to your terminal during development.

### TanStack Start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [
    react(),
    browserEcho({
      injectHtml: false, // Important: TanStack Start doesn't use index.html
      stackMode: 'condensed',
      fileLog: { enabled: true },
    }),
  ],
});
```

**Important for TanStack Start**: Since TanStack Start renders without an `index.html`, you need to set `injectHtml: false` and import the virtual module manually in your router:

```ts
// src/router.tsx
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-echo');
}
```

## Configuration Options

```ts
interface BrowserEchoViteOptions {
  enabled?: boolean;                 // default: true (dev only)
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true
  tag?: string;                      // default: '[browser]'
  colors?: boolean;                  // default: true
  injectHtml?: boolean;              // default: true
  stackMode?: 'none' | 'condensed' | 'full'; // default: 'condensed'
  showSource?: boolean;              // default: true
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  truncate?: number;                 // default: 10_000 chars
  fileLog?: { enabled?: boolean; dir?: string }; // default: disabled
}
```

## File Logging (Vite-only feature)

Enable optional file logging to write browser logs to disk:

```ts
browserEcho({
  fileLog: { 
    enabled: true, 
    dir: 'logs/frontend' // default: 'logs/frontend'
  }
})
```

## How it works

The plugin:
1. Adds dev middleware to handle POST requests at `/__client-logs`
2. Provides a virtual module `virtual:browser-echo` that initializes the client
3. Optionally injects the virtual module import into your `index.html`
4. Prints formatted logs to your terminal with colors and stack traces

## Dependencies

This package depends on [@browser-echo/core](https://github.com/instructa/browser-echo/tree/main/packages/core) for the client-side functionality.

## Troubleshooting

- **No logs appear**: Ensure the plugin is added and either `index.html` exists or you import the virtual module manually
- **Too noisy**: Limit to `include: ['warn','error']` and use `stackMode: 'condensed'`
- **Duplicate logs in browser**: Set `preserveConsole: false`

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
- [Core Package](https://github.com/instructa/browser-echo/tree/main/packages/core)
