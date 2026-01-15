import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['lib/index.mjs'],
  format: ['cjs', 'esm'],
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
