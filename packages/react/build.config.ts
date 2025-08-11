import { defineBuildConfig } from 'unbuild';
export default defineBuildConfig({
  entries: ['./src/index'],
  declaration: true,
  clean: true,
  rollup: { emitCJS: false, esbuild: { jsx: 'automatic', jsxImportSource: 'react' } },
  externals: ['react', 'react-dom', 'react/jsx-runtime', '@browser-echo/core']
});
