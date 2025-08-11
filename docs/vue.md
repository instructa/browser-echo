# Vue Guide

## Vue + Vite (recommended)

```bash
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

If you don’t have `index.html`:

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('virtual:browser-echo');
}
```

## Vue (non‑Vite)

Install the Vue plugin helper and ensure your dev server exposes `/__client-logs`:

```bash
pnpm add -D @browser-echo/vue @browser-echo/core
```

```ts
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { createBrowserEchoVuePlugin } from '@browser-echo/vue';

const app = createApp(App);
if (import.meta.env.DEV) app.use(createBrowserEchoVuePlugin());
app.mount('#app');
```

> Prefer the Vite provider if possible; it gives you the dev middleware out-of-the-box.


