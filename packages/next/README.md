# @browser-echo/next

Next.js App Router integration for streaming browser console logs to your dev terminal.

Since Turbopack doesn't use Vite, this package provides a tiny route handler and an early script component to patch `console.*` methods and forward logs to your development server.

## Table of Contents

- [Installation](#installation)
- [Quick Setup](#quick-setup-recommended)
- [Manual Setup](#manual-setup)
- [Available Options](#available-options)
- [Install MCP Server](#install-mcp-server)

## Features

- Next.js App Router compatible
- Early script injection for immediate log capture
- Route handler for receiving browser logs
- Automatic setup command
- Works with Turbopack
- No production impact

## Installation

```bash
npm install -D @browser-echo/next
# or
pnpm add -D @browser-echo/next
```

## Quick Setup (Recommended)

Run the setup command to automatically create the route file:

```bash
npx @browser-echo/next setup
# or
pnpm dlx @browser-echo/next setup
```

This creates `app/api/client-logs/route.ts` with the necessary exports.

## Available Options

Configure the `<BrowserEchoScript />` component with these options:

```ts
type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface BrowserEchoScriptProps {
  enabled?: boolean;                 // default: true (dev only)
  route?: `/${string}`;              // default: '/api/client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true (also keep logging in the browser)
  tag?: string;                      // default: '[browser]'
  // stacks
  stackMode?: 'none' | 'condensed' | 'full'; // default: 'condensed'
  showSource?: boolean;              // default: true (when available)
  // batching
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  // Opt-in network capture (fetch/XHR/WS)
  networkLogs?: { enabled?: boolean; captureFull?: boolean };
}
```

### Option Details

- **`enabled`**: Toggle the entire functionality (automatically disabled in production)
- **`route`**: The endpoint path where logs are sent (must match your route file location)
- **`include`**: Which console methods to capture and forward
- **`preserveConsole`**: Whether to keep original console behavior in the browser
- **`tag`**: Prefix for terminal output to identify browser logs
- **`stackMode`**: How much stack trace information to include
  - `'none'`: No stack traces
  - `'condensed'` (default): Essential stack info only
  - `'full'`: Complete stack traces
- **`showSource`**: Include source file location hints (file:line:col)
- **`batch`**: Control log batching behavior
  - `size`: Max logs per batch (default: 20)
  - `interval`: Max time between batches in ms (default: 300)

### Usage Example

Here's how to use `<BrowserEchoScript />` with custom options:

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import BrowserEchoScript from '@browser-echo/next/BrowserEchoScript';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'development' && (
          <BrowserEchoScript 
            route="/api/client-logs"
            include={['warn', 'error']}
            preserveConsole={true}
            tag="[NextJS Browser]"
            stackMode="condensed"
            showSource={true}
            batch={{ size: 10, interval: 500 }}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

This configuration:
- Sends logs to `/api/client-logs` endpoint
- Only captures warnings and errors (filters out debug/info/log)
- Keeps original console behavior in browser
- Tags terminal output with `[NextJS Browser]`
- Uses condensed stack traces for cleaner output
- Shows source file locations
- Batches up to 10 logs every 500ms

## Manual Setup

### 1. Add the early script

Render the script in your root layout head (dev-only):

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import BrowserEchoScript from '@browser-echo/next/BrowserEchoScript';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'development' && <BrowserEchoScript />}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 2. Add the route handler

Forward logs to your terminal via a dedicated route:

```ts
// app/api/client-logs/route.ts
export { POST, runtime, dynamic } from '@browser-echo/next/route';
```

- Default route is `/api/client-logs` (works best in Next.js 15+)
- We set `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` to ensure it runs on Node and isn't cached

## Usage Example

Complete setup example:

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import BrowserEchoScript from '@browser-echo/next/BrowserEchoScript';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'development' && (
          <BrowserEchoScript 
            route="/api/client-logs"
            include={['warn', 'error']}
            stackMode="condensed"
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

```ts
// app/api/client-logs/route.ts
export { POST, runtime, dynamic } from '@browser-echo/next/route';
```

## Install MCP Server

Next.js automatically discovers and forwards logs to MCP servers. No configuration needed in most cases!

**📖 [First, set up the MCP server](../mcp/README.md#installation) for your AI assistant, then configure framework options below.**

### Auto-Discovery (Default)

The Next.js route handler automatically detects MCP servers and forwards logs when available. When MCP is detected, terminal output is suppressed by default.

Discovery order:
1. `BROWSER_ECHO_MCP_URL` (normalized, trailing `/mcp` is stripped)
2. Dev probe: `http://127.0.0.1:5179` then `http://localhost:5179`
3. Project-local discovery file: `.browser-echo-mcp.json` (walks up parent directories)

### Environment Variables

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` — Set MCP server URL (base URL is derived automatically). When set, the route will forward; terminal printing is suppressed unless explicitly disabled.
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Force suppress terminal output
- `BROWSER_ECHO_SUPPRESS_TERMINAL=0` — Force show terminal output even when MCP is active

### Disable MCP Discovery

```ts
// app/api/client-logs/route.ts
import { POST as BasePost } from '@browser-echo/next/route';

// Custom handler without MCP discovery
export async function POST(request: NextRequest) {
  // Set environment to disable MCP
  const originalMcpUrl = process.env.BROWSER_ECHO_MCP_URL;
  delete process.env.BROWSER_ECHO_MCP_URL;
  
  const result = await BasePost(request);
  
  // Restore original env
  if (originalMcpUrl) process.env.BROWSER_ECHO_MCP_URL = originalMcpUrl;
  
  return result;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

## How it works

1. `<BrowserEchoScript />` injects client-side code that patches console methods
2. Browser logs are batched and sent to your route endpoint
3. The route handler receives logs and prints them to your terminal
4. Only active in development mode

## Custom Route Path

If you change the route path, update both places:

```tsx
// Use custom route in script
<BrowserEchoScript route="/api/my-logs" />
```

```ts
// Create matching route file: app/api/my-logs/route.ts
export { POST, runtime, dynamic } from '@browser-echo/next/route';
```

## Dependencies

This package depends on [@browser-echo/core](https://github.com/instructa/browser-echo/tree/main/packages/core) for the client-side functionality.

## Notes

- The provider prints to stdout—great for local dev and AI assistants
- If you need file logging in Next.js, you can wrap the exported `POST` handler and write to disk as needed
- The setup works with both Pages Router and App Router, but this package is optimized for App Router

## Troubleshooting

- **No logs appear**: Make sure `app/api/client-logs/route.ts` is exported and `<BrowserEchoScript />` is rendered in `<head>`
- **Endpoint 404**: Verify your route file path matches the script's `route` prop
- **Too noisy**: Limit to `include: ['warn','error']` and use `stackMode: 'condensed'`

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
- [Core Package](https://github.com/instructa/browser-echo/tree/main/packages/core)
