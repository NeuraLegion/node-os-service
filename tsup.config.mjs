import { defineConfig } from 'tsup';

export default defineConfig({
  target: 'node20',
  entry: ['index.mjs'],
  format: ['cjs'],
  outDir: '.',
  splitting: false,
  sourcemap: false,
  clean: false,
  dts: false,
  shims: true,
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs',
    };
  },
});
