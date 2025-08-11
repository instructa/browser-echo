# React Guide

## React + Vite (recommended)

Install the Vite provider:

```bash
pnpm add -D @browser-echo/vite
```

Enable in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserEcho from '@browser-echo/vite';

export default defineConfig({
  plugins: [react(), browserEcho()],
});
```

If you don’t use `index.html`, add:

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-echo');
}
```

## React (non‑Vite)

Install the React helper (client‑only) and provide any dev endpoint that accepts POSTs at `/__client-logs`:

```bash
pnpm add -D @browser-echo/react @browser-echo/core
```

Mount the provider:

```tsx
// src/main.tsx
import { BrowserEchoProvider } from '@browser-echo/react';

function Root() {
  return (
    <>
      {process.env.NODE_ENV === 'development' && <BrowserEchoProvider />}
      <App />
    </>
  );
}
```

> You still need a server route that prints the received logs. If you don’t have one, prefer the Vite provider—it includes the dev middleware for you.


