import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/index',
    './src/client',
    './src/server',
    './src/types',
    './src/worker'
  ],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  externals: []
});
