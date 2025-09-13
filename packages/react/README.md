# @browser-echo/react

React component for streaming browser console logs to your dev terminal (non-Vite setups).

> **💡 Using React with Vite?** Check out our [React + Vite setup guide](../vite/README.md#react--vite) for the recommended approach using `@browser-echo/vite`.

This package provides a React provider component for non-Vite environments. If you're using Vite, prefer [@browser-echo/vite](../vite/README.md#react--vite) which includes the dev middleware automatically.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Install MCP Server](#install-mcp-server)

## Features

- React provider component
- Client-side console patching
- Configurable log levels and batching
- Works with any React setup (non-Vite)
- No production impact

## When to use this package

- ✅ React projects **not** using Vite
- ✅ Custom bundler setups
- ✅ When you want manual control over initialization

## When NOT to use this package

- ❌ React + Vite projects (use [@browser-echo/vite](https://github.com/instructa/browser-echo/tree/main/packages/vite) instead)
- ❌ Next.js projects (use [@browser-echo/next](https://github.com/instructa/browser-echo/tree/main/packages/next) instead)

## Installation

```bash
npm install -D @browser-echo/react @browser-echo/core
# or
pnpm add -D @browser-echo/react @browser-echo/core
```

## Setup

### 1. Add the provider component

Mount the provider in your app root (development only):

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserEchoProvider } from '@browser-echo/react';
import App from './App';

function Root() {
  return (
    <>
      {process.env.NODE_ENV === 'development' && <BrowserEchoProvider />}
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
```

### 2. Create a server endpoint

You need a development server endpoint that accepts POST requests at `/__client-logs` and prints the received logs to your terminal. The React provider only handles the client side.

Note: Network capture (fetch/XHR/WS) is available via `@browser-echo/core` and framework providers (Vite, Next, Nuxt). This React (non-Vite) package does not inject network capture on its own.

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

Customize the provider with props:

```tsx
<BrowserEchoProvider 
  route="/__client-logs"
  include={['warn', 'error']}
  preserveConsole={true}
  tag="[browser]"
  batch={{ size: 20, interval: 300 }}
  stackMode="condensed"
/>
```

### Available Props

```ts
interface BrowserEchoProviderProps {
  route?: `/${string}`;              // default: '/__client-logs'
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true
  tag?: string;                      // default: '[browser]'
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  stackMode?: 'full' | 'condensed' | 'none';    // default: 'condensed'
}
```

## Complete Example

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserEchoProvider } from '@browser-echo/react';
import App from './App';

function Root() {
  return (
    <>
      {process.env.NODE_ENV === 'development' && (
        <BrowserEchoProvider 
          route="/api/dev-logs"
          include={['warn', 'error']}
          stackMode="condensed"
          tag="[react-app]"
        />
      )}
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
```

## Alternative: Direct Usage

If you prefer not to use the React component, you can use the core library directly:

```ts
// src/main.tsx
import { initBrowserEcho } from '@browser-echo/core';

if (process.env.NODE_ENV === 'development') {
  initBrowserEcho({
    route: '/__client-logs',
    include: ['warn', 'error'],
  });
}
```

## Install MCP Server

For React (non-Vite) apps, MCP forwarding depends on your server-side route implementation. The React provider only handles browser-side log collection.

**📖 [First, set up the MCP server](../mcp/README.md#installation) for your AI assistant, then configure framework options below.**

### Environment Variables

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` — Set in your server environment
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Control terminal output in your route handler

### Server Route MCP Integration

Update your server route to forward to MCP:

```js
// Example Express route with MCP forwarding
app.post('/__client-logs', async (req, res) => {
  const payload = req.body;
  
  // Forward to MCP if configured
  const mcpUrl = process.env.BROWSER_ECHO_MCP_URL;
  if (mcpUrl) {
    const ingestUrl = mcpUrl.replace('/mcp', '/__client-logs');
    try {
      await fetch(ingestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // Suppress terminal output when forwarding
      if (process.env.BROWSER_ECHO_SUPPRESS_TERMINAL !== '0') {
        return res.status(204).end();
      }
    } catch {}
  }
  
  // Local terminal output
  for (const entry of payload.entries) {
    console.log(`[browser] ${entry.level.toUpperCase()}: ${entry.text}`);
  }
  res.status(204).end();
});
```

## Dependencies

This package depends on [@browser-echo/core](https://github.com/instructa/browser-echo/tree/main/packages/core) for the client-side functionality.

## Comparison with Other Packages

| Package | Best for | Includes server | Auto-setup |
|---------|----------|----------------|------------|
| @browser-echo/vite | React + Vite | ✅ | ✅ |
| @browser-echo/next | Next.js | ✅ | ✅ |
| @browser-echo/react | React (non-Vite) | ❌ | ❌ |

## Troubleshooting

- **No logs appear**: Ensure you have a server endpoint that handles POST requests at your specified route
- **CORS errors**: Make sure your dev server accepts requests from your app's origin
- **Too many logs**: Use `include: ['warn', 'error']` to reduce noise

## Author

[Kevin Kern](https://github.com/regenrek)

## License

MIT

## Links

- [Main Repository](https://github.com/instructa/browser-echo)
- [Documentation](https://github.com/instructa/browser-echo#readme)
- [Core Package](https://github.com/instructa/browser-echo/tree/main/packages/core)
- [Vite Package](https://github.com/instructa/browser-echo/tree/main/packages/vite) (recommended for Vite users)
