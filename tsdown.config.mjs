import { defineConfig } from 'tsdown';

export default defineConfig({
  target: 'node20',
  entry: ['index.mjs'],
  format: ['cjs'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  shims: true,
  dts: false
});
