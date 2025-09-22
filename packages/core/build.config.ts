import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/index',
    './src/client',
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
