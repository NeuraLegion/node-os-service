import { defineConfig } from 'tsdown';

export default defineConfig({
  target: 'node20',
  entry: ['index.mjs'],
  format: ['cjs'],
  outDir: '.',
  sourcemap: true,
  clean: false,
  shims: true,
  dts: false
});
