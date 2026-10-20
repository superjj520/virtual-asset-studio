import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const releaseRoot = join(root, 'release');
const appDirectoryName = '虚拟资产创作工作台-darwin-arm64';
const appName = '虚拟资产创作工作台.app';
const expectedDirectory = join(releaseRoot, appDirectoryName);
const expectedApp = join(expectedDirectory, appName);

if (!existsSync(expectedApp) || !statSync(expectedApp).isDirectory()) {
  throw new Error(`发布校验失败：找不到唯一当前 App：${expectedApp}`);
}

const releaseEntries = readdirSync(releaseRoot, { withFileTypes: true });
const parallelAppDirectories = releaseEntries
  .filter((entry) => entry.isDirectory() && entry.name !== appDirectoryName)
  .filter((entry) => entry.name.endsWith('.app') || entry.name.includes('虚拟资产创作工作台-darwin-arm64'));

if (parallelAppDirectories.length > 0) {
  throw new Error(`发布校验失败：发现并行 App 目录：${parallelAppDirectories.map((entry) => entry.name).join('、')}`);
}

if (existsSync(join(releaseRoot, '.archive'))) {
  throw new Error('发布校验失败：release/.archive 不允许作为交付目录的一部分。');
}

console.log(`发布校验通过：release 中只有一个当前 App：${expectedApp}`);
