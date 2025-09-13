# @browser-echo/nuxt

Nuxt 3/4 module for streaming browser console logs to your dev terminal.

This Nuxt module registers a Nitro server route and a client plugin (dev-only) with zero manual wiring beyond adding the module to your configuration.

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
- [Configuration Options](#configuration-options)
- [Install MCP Server](#install-mcp-server)

## Features

- Zero-config Nuxt 3/4 module
- Automatic Nitro server route registration
- Client plugin auto-injection
- Configurable via `nuxt.config.ts`
- Works with Nuxt's dev proxy setup
- No production impact

## Installation

```bash
npm install -D @browser-echo/nuxt
# or
pnpm add -D @browser-echo/nuxt
```

## Setup

Add the module to your Nuxt configuration:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@browser-echo/nuxt'],
  
  // Optional configuration
  browserEcho: {
    route: '/__client-logs',
    include: ['warn', 'error'],
    tag: '[web]',
    batch: { size: 20, interval: 300 },
    preserveConsole: true,
    stackMode: 'condensed', // 'full' | 'condensed' | 'none'
  }
});
```

That's it! Run `nuxi dev` and open your app—your server terminal will show browser logs.

## Configuration Options

```ts
interface BrowserEchoNuxtOptions {
  enabled?: boolean;                 // default: true (dev only)
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true
  tag?: string;                      // default: '[browser]'
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  stackMode?: 'full' | 'condensed' | 'none';    // default: 'condensed'
  // Opt-in network capture (fetch/XHR/WS)
  networkLogs?: { enabled?: boolean; captureFull?: boolean };
}
```

### Stack Mode Options

- `full`: Send complete filtered stack trace
- `condensed` (default): Send only the top application frame
- `none`: Do not send any stack frames

## Usage Example

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@browser-echo/nuxt'],
  
  browserEcho: {
    // Only forward warnings and errors
    include: ['warn', 'error'],
    
    // Custom tag for terminal output
    tag: '[frontend]',
    
    // Reduce noise with condensed stacks
    stackMode: 'condensed',
    
    // Batch settings for performance
    batch: { 
      size: 10,    // Send after 10 logs
      interval: 500 // Or after 500ms
    }
  }
});
```

## Install MCP Server

Nuxt automatically discovers and forwards logs to MCP servers. No configuration needed in most cases!

**📖 [First, set up the MCP server](../mcp/README.md#installation) for your AI assistant, then configure framework options below.**

### Auto-Discovery (Default)

The Nuxt server handler automatically detects MCP servers and forwards logs when available. When MCP is detected, terminal output is suppressed by default.

Discovery order:
1. `BROWSER_ECHO_MCP_URL` (normalized, trailing `/mcp` is stripped)
2. Dev probe: `http://127.0.0.1:5179` then `http://localhost:5179`
3. Project-local discovery file: `.browser-echo-mcp.json` (walks up parent directories)

### Environment Variables

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` — Set MCP server URL (base URL is derived automatically). When set, the handler forwards; terminal printing is suppressed unless explicitly disabled.
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Force suppress terminal output
- `BROWSER_ECHO_SUPPRESS_TERMINAL=0` — Force show terminal output even when MCP is active

### Disable MCP Discovery

Set `BROWSER_ECHO_MCP_URL` empty and avoid discovery by removing the module, or customize the handler if you need full control.

## How it works

1. The module registers a Nitro server route at `/__client-logs` (configurable)
2. A client plugin is automatically added that initializes browser log forwarding
3. Browser console logs are batched and sent to the server route
4. Logs are printed to your terminal with formatting and colors
5. Everything is automatically disabled in production

## Development vs Production

- **Development**: Module is active, logs are forwarded to terminal
- **Production**: Module is completely disabled, no client code is injected

## Nitro Route Registration

The module registers the route directly with Nitro to avoid issues with Nuxt's dev proxy setup. This ensures reliable log forwarding even in complex development environments.

## Dependencies

This package depends on [@browser-echo/core](https://github.com/instructa/browser-echo/tree/main/packages/core) for the client-side functionality.

## Important Notes

- After changing `browserEcho` options, restart the Nuxt dev server to regenerate the client plugin
- If you run a custom reverse proxy, ensure the log route remains same-origin and not behind auth in dev
- The module only operates in development mode and has zero production impact

## Troubleshooting

- **No logs appear**: Confirm the module is in `modules[]` and you're in dev mode
- **Route conflicts**: Change the `route` option if `/__client-logs` conflicts with your app
- **Too many logs**: Use `include: ['warn', 'error']` and `stackMode: 'condensed'`
- **Proxy issues**: The module registers a Nitro route directly to avoid proxy complications

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
- [Core Package](https://github.com/instructa/browser-echo/tree/main/packages/core)
