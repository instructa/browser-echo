# @browser-echo/next

Next.js App Router integration for streaming browser console logs to your dev terminal.

Since Turbopack doesn't use Vite, this package provides a tiny route handler and an early script component to patch `console.*` methods and forward logs to your development server.

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
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true (also keep logging in the browser)
  tag?: string;                      // default: '[browser]'
  // stacks
  stackMode?: 'none' | 'condensed' | 'full'; // default: 'condensed'
  showSource?: boolean;              // default: true (when available)
  // batching
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
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

- Route defaults to `/__client-logs` but works better as `/api/client-logs` in Next.js 15+
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

- **No logs appear**: Make sure `app/__client-logs/route.ts` is exported and `<BrowserEchoScript />` is rendered in `<head>`
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
