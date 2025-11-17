import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  minify: false,
  splitting: false,
  treeshake: true,
  shims: true,
  // Mark problematic dependencies as external to avoid dynamic require issues
  external: [
    '@modelcontextprotocol/sdk',
    'cosmiconfig',
    'pino',
    'pino-pretty'
  ],
  esbuildOptions(options) {
    options.conditions = ['node'];
  }
});
