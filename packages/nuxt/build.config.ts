import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/module',
    './src/runtime/server/handler'
  ],
  declaration: true,
  clean: true,
  rollup: { emitCJS: false },
  externals: ['@nuxt/kit', '@nuxt/schema', 'h3', '@browser-echo/core']
});
