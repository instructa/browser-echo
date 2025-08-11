import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['./src/index'],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  externals: ['vite', 'ansis', '@browser-echo/core']
});
