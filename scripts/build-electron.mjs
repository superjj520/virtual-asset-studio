import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist/electron', { recursive: true, force: true });
await build({
  entryPoints: ['electron/runtime.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/electron/runtime.mjs',
  external: ['electron', 'better-sqlite3', 'sharp']
});
