# @browser-echo/vue

Vue plugin for streaming browser console logs to your dev terminal (non-Vite setups).

> **💡 Using Vue with Vite?** Check out our [Vue + Vite setup guide](../vite/README.md#vue--vite) for the recommended approach using `@browser-echo/vite`.

This package provides a Vue plugin helper for non-Vite environments. If you're using Vite, prefer [@browser-echo/vite](../vite/README.md#vue--vite) which includes the dev middleware automatically.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Install MCP Server](#install-mcp-server)

## Features

- Vue 3 plugin integration
- Client-side console patching
- Configurable log levels and batching
- Works with any Vue setup (non-Vite)
- No production impact

## When to use this package

- ✅ Vue projects **not** using Vite
- ✅ Custom bundler setups
- ✅ When you want manual control over initialization

## When NOT to use this package

- ❌ Vue + Vite projects (use [@browser-echo/vite](https://github.com/instructa/browser-echo/tree/main/packages/vite) instead)
- ❌ Nuxt projects (use [@browser-echo/nuxt](https://github.com/instructa/browser-echo/tree/main/packages/nuxt) instead)

## Installation

```bash
npm install -D @browser-echo/vue @browser-echo/core
# or
pnpm add -D @browser-echo/vue @browser-echo/core
```

## Setup

### 1. Add the Vue plugin

Register the plugin in your app (development only):

```ts
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { createBrowserEchoVuePlugin } from '@browser-echo/vue';

const app = createApp(App);

// Only in development
if (import.meta.env.DEV) {
  app.use(createBrowserEchoVuePlugin({
    route: '/__client-logs',
    include: ['warn', 'error'],
    stackMode: 'condensed',
  }));
}

app.mount('#app');
```

### 2. Create a server endpoint

You need a development server endpoint that accepts POST requests at `/__client-logs` and prints the received logs to your terminal. The Vue plugin only handles the client side.

Example Express.js endpoint:

```js
// dev-server.js
app.post('/__client-logs', express.json(), (req, res) => {
  const { sessionId, entries } = req.body;
  
  entries.forEach(entry => {
    const timestamp = new Date(entry.time).toISOString();
    const level = entry.level.toUpperCase();
    console.log(`[browser] [${sessionId}] ${level}: ${entry.text}`);
    if (entry.stack) {
      console.log(entry.stack);
    }
  });
  
  res.status(200).end();
});
```

## Configuration

Pass options to the plugin factory:

```ts
const plugin = createBrowserEchoVuePlugin({
  route: '/__client-logs',
  include: ['warn', 'error'],
  preserveConsole: true,
  tag: '[vue-app]',
  batch: { size: 20, interval: 300 },
  stackMode: 'condensed'
});

app.use(plugin);
```

### Available Options

```ts
interface BrowserEchoVueOptions {
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true
  tag?: string;                      // default: '[browser]'
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  stackMode?: 'full' | 'condensed' | 'none';    // default: 'condensed'
}
```

## Complete Example

```ts
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { createBrowserEchoVuePlugin } from '@browser-echo/vue';

const app = createApp(App);

if (import.meta.env.DEV) {
  app.use(createBrowserEchoVuePlugin({
    route: '/api/dev-logs',
    include: ['warn', 'error'],
    stackMode: 'condensed',
    tag: '[vue-app]',
    batch: { size: 10, interval: 500 }
  }));
}

app.mount('#app');
```

## Alternative: Direct Usage

If you prefer not to use the Vue plugin, you can use the core library directly:

```ts
// main.ts
import { initBrowserEcho } from '@browser-echo/core';

if (import.meta.env.DEV) {
  initBrowserEcho({
    route: '/__client-logs',
    include: ['warn', 'error'],
  });
}
```

## Vue + Vite (Recommended Alternative)

For Vue + Vite projects, use the Vite package instead:

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
  plugins: [vue(), browserEcho()],
});
```

## Install MCP Server

For Vue (non-Vite) apps, MCP forwarding depends on your server-side route implementation. The Vue provider only handles browser-side log collection.

**📖 [First, set up the MCP server](../mcp/README.md#installation) for your AI assistant, then configure framework options below.**

### Environment Variables

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179` — Set in your server environment  
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Control terminal output in your route handler

### Server Route MCP Integration

See the [React MCP Settings](../react/README.md#mcp-settings) for an example server route with MCP forwarding.

## Dependencies

This package depends on [@browser-echo/core](https://github.com/instructa/browser-echo/tree/main/packages/core) for the client-side functionality.

## Comparison with Other Packages

| Package | Best for | Includes server | Auto-setup |
|---------|----------|----------------|------------|
| @browser-echo/vite | Vue + Vite | ✅ | ✅ |
| @browser-echo/nuxt | Nuxt 3/4 | ✅ | ✅ |
| @browser-echo/vue | Vue (non-Vite) | ❌ | ❌ |

## Troubleshooting

- **No logs appear**: Ensure you have a server endpoint that handles POST requests at your specified route
- **CORS errors**: Make sure your dev server accepts requests from your app's origin
- **Too many logs**: Use `include: ['warn', 'error']` to reduce noise
- **Plugin not working**: Verify the plugin is registered and you're in development mode

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
- [Core Package](https://github.com/instructa/browser-echo/tree/main/packages/core)
- [Vite Package](https://github.com/instructa/browser-echo/tree/main/packages/vite) (recommended for Vite users)
