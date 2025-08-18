import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/route',
    './src/BrowserEchoScript',
    './src/setup',
    './src/client'
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: false,
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' }
  },
  externals: ['next', 'react', 'react-dom', 'next/script', 'react/jsx-runtime', '@browser-echo/core', '@browser-echo/mcp']
});
