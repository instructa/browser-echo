# @browser-echo/core

Core client-side functionality for streaming browser console logs to your dev terminal.

This package provides the `initBrowserEcho` function that patches `console.*` methods and forwards logs to a development server endpoint. It's designed to be used as a dependency by framework-specific providers.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Install MCP Server](#install-mcp-server)

## Features

- Drop-in client patch that wraps `console.log/info/warn/error/debug`
- Batched HTTP requests (uses `sendBeacon` when available)
- Source hints `(file:line:col)` + stack traces
- Configurable log levels and batching
- Circular reference handling in logged objects
- No production impact (meant for development only)

## Installation

```bash
npm install -D @browser-echo/core
# or
pnpm add -D @browser-echo/core
```

## Usage

```ts
import { initBrowserEcho } from '@browser-echo/core';

// Initialize with default options
initBrowserEcho();

// Or customize the behavior
initBrowserEcho({
  route: '/__client-logs',
  include: ['warn', 'error'],
  preserveConsole: true,
  tag: '[browser]',
  batch: { size: 20, interval: 300 },
  stackMode: 'condensed'
});
```

## Options

Most providers accept these options (names may appear as plugin options or component props):

```ts
type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface BrowserEchoOptions {
  enabled?: boolean;                 // default: true (dev only)
  route?: `/${string}`;              // default: '/api/client-logs' (Next), '/__client-logs' (others)
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true (also keep logging in the browser)
  tag?: string;                      // default: '[browser]'
  // stacks
  stackMode?: 'none' | 'condensed' | 'full'; // default: 'full' (provider-specific; Vite supports all)
  showSource?: boolean;              // default: true (when available)
  // batching
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  // server-side
  truncate?: number;                 // default: 10_000 chars (Vite)
  fileLog?: { enabled?: boolean; dir?: string }; // Vite-only
}
```

> Note: File logging and `truncate` are currently implemented in the Vite plugin's dev server middleware. Nuxt/Next providers print to stdout by default (you can extend them if you need file output there).


## Framework Providers

This core package is typically used through framework-specific providers:

- **@browser-echo/vite** - For Vite-based projects (React, Vue, TanStack Start)
- **@browser-echo/next** - For Next.js App Router
- **@browser-echo/nuxt** - For Nuxt 3/4
- **@browser-echo/react** - For React (non-Vite)
- **@browser-echo/vue** - For Vue (non-Vite)

See the [main repository](https://github.com/instructa/browser-echo) for complete setup guides.

## Install MCP Server

For core usage, MCP forwarding depends on your server-side route implementation. The core package only handles browser-side log collection.

**📖 [First, set up the MCP server](../mcp/README.md#installation) for your AI assistant, then configure framework options below.**

### Environment Variables

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` — Set in your server environment
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Control terminal output in your route handler

### Server Route MCP Integration

See the [React MCP Settings](../react/README.md#mcp-settings) for an example server route with MCP forwarding.

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
