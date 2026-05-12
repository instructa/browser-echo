import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@browser-echo/core/server': fileURLToPath(new URL('./packages/core/src/server.ts', import.meta.url)),
    },
  },
  test: {
    fileParallelism: false,
    include: [
      'packages/*/test/**/*.{test,spec}.ts?(x)',
      'packages/*/src/**/__tests__/**/*.{test,spec}.ts?(x)'
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: { reporter: ['text', 'html'] }
  }
});
