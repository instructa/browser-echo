### TanStack Start (Vite) integration

TanStack Start runs on Vite in dev, so you can use this plugin directly.

1) Register the plugin in `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import browserLogsToTerminal from 'vite-browser-logs';

export default defineConfig({
  plugins: [
    browserLogsToTerminal({
      // optional tuning
      colors: true,
      stackMode: 'condensed',
      fileLog: { enabled: true, dir: 'logs/frontend' },
    }),
  ],
});
```

2) Import the virtual module on the client (e.g. `src/router.tsx`)

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-logs-to-terminal');
}
```

Start your dev server; browser console output will stream to your Vite terminal.
