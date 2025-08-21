import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['./src/index'],
  clean: true,
  declaration: true,
  failOnWarn: false,
  externals: [
    '@modelcontextprotocol/sdk',
  ],
  rollup: {
    emitCJS: false,
    inlineDependencies: false,
  },
});