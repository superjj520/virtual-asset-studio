#!/usr/bin/env node
/** 把本地素材服务打成单文件，供 `node --experimental-sqlite` 直接跑。 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist/service', { recursive: true, force: true });
await build({
  entryPoints: ['electron/local-service.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/service/materials.mjs',
});

console.log('本地素材服务已构建：dist/service/materials.mjs');
