import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.{test,spec}.ts?(x)',
      'packages/*/src/**/__tests__/**/*.{test,spec}.ts?(x)'
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: { reporter: ['text', 'html'] }
  }
});
