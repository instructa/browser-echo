import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/index',
    './src/client',
    './src/types'
  ],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  externals: []
});
