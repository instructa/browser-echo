# Next.js (App Router) Guide

Turbopack doesn't use Vite, so we ship a tiny route handler and an early script to patch `console.*`.

## Install

```bash
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

## Manual Setup

### Add the early script

Render the script in your root layout head (dev‑only):

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

## Add the route

Forward logs to your terminal via a dedicated route:

```ts
// app/api/client-logs/route.ts
export { POST, runtime, dynamic } from '@browser-echo/next/route';
```

* Route defaults to `/__client-logs` but works better as `/api/client-logs` in Next.js 15+
* We set `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` to ensure it runs on Node and isn't cached.

### Customizing

* `<BrowserEchoScript route="/__client-logs" include={['warn','error']} preserveConsole tag="[browser]" />`
* If you change `route`, update both the script prop and your route folder path.

### Notes

* The provider prints to stdout—great for local dev and AI assistants.
* If you need file logging in Next, you can wrap the exported `POST` handler and write to disk as needed.
