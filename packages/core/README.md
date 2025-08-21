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

```ts
interface InitBrowserEchoOptions {
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true (also keep logging in browser)
  tag?: string;                      // default: '[browser]'
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  stackMode?: 'full' | 'condensed' | 'none';    // default: 'condensed'
}
```

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
