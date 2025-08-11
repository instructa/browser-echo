# @browser-echo/vite

Vite plugin for streaming browser console logs to your dev terminal with colors, stack traces, and optional file logging.

This package provides a Vite plugin that includes dev middleware and a virtual module to forward browser console logs to your terminal during development. Works with React, Vue, TanStack Start, and any Vite-based project.

## Features

- Vite plugin with built-in dev middleware
- Virtual module for automatic client initialization
- Optional file logging (unique to Vite provider)
- Colorized terminal output
- Full stack trace support with multiple modes
- Works with `index.html` or server-side rendered apps

## Installation

```bash
pnpm add -D @browser-echo/vite
```

## Quick Setup

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // or @vitejs/plugin-vue
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [
    react(), // or vue()
    browserEcho({
      // optional configuration
      colors: true,
      stackMode: 'condensed', // 'none' | 'condensed' | 'full'
      fileLog: { enabled: false }, // Vite-only file logging
    }),
  ],
});
```

### For apps without `index.html`

Some setups (like TanStack Start) render without an `index.html`. In that case, set `injectHtml: false` and import the virtual module manually:

```ts
// e.g., src/entry-client.tsx or your router bootstrap
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

## Usage Examples

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
      stackMode: 'condensed',
      fileLog: { enabled: true },
    }),
  ],
});
```

### Vue + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [vue(), browserEcho()],
});
```

### React + Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [react(), browserEcho()],
});
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
