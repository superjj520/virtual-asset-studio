import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";

const root = process.cwd();
const releaseRoot = join(root, "release");
const appDirectoryName = "虚拟资产创作工作台-darwin-arm64";
const appName = "虚拟资产创作工作台.app";
const staging = mkdtempSync(join(tmpdir(), "virtual-asset-studio-package-"));
const packOutput = mkdtempSync(join(tmpdir(), "virtual-asset-studio-release-"));
const stagingApp = join(packOutput, appDirectoryName, appName);
const finalDirectory = join(releaseRoot, appDirectoryName);
const finalApp = join(finalDirectory, appName);
const electronVersion = JSON.parse(readFileSync(join(root, "node_modules", "electron", "package.json"), "utf8")).version;
const electronCacheRoot = process.env.ELECTRON_CACHE || process.env.electron_config_cache || join(homedir(), "Library", "Caches", "electron");
const electronZipName = `electron-v${electronVersion}-darwin-arm64.zip`;
const cachedElectronZipDirectory = existsSync(electronCacheRoot)
  ? readdirSync(electronCacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(electronCacheRoot, entry.name))
    .find((directory) => existsSync(join(directory, electronZipName)))
  : undefined;

const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
const removeHiddenDirectories = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      rmSync(join(directory, entry.name), { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) removeHiddenDirectories(join(directory, entry.name));
  }
};

try {
  cpSync(join(root, "package.json"), join(staging, "package.json"));
  cpSync(join(root, "package-lock.json"), join(staging, "package-lock.json"));
  cpSync(join(root, "dist"), join(staging, "dist"), { recursive: true });
  mkdirSync(join(staging, "electron"));
  cpSync(join(root, "electron", "main.mjs"), join(staging, "electron", "main.mjs"));
  cpSync(join(root, "electron", "preload.cjs"), join(staging, "electron", "preload.cjs"));
  cpSync(join(root, "node_modules"), join(staging, "node_modules"), { recursive: true, dereference: true });

  run("npm", ["prune", "--omit=dev", "--ignore-scripts"], staging);
  mkdirSync(join(staging, "node_modules"), { recursive: true });
  cpSync(join(root, "node_modules", "electron"), join(staging, "node_modules", "electron"), { recursive: true, dereference: true });
  removeHiddenDirectories(join(staging, "node_modules"));
  if (cachedElectronZipDirectory) {
    const packagerArgs = [
      staging,
      "虚拟资产创作工作台",
      "--platform=darwin",
      "--arch=arm64",
      `--out=${packOutput}`,
      "--overwrite",
      "--prune=false",
      "--app-bundle-id=com.superjj.virtualassetstudio",
      "--executable-name=virtual-asset-studio",
      "--no-asar",
      `--electron-zip-dir=${cachedElectronZipDirectory}`,
    ];
    run(join(root, "node_modules", ".bin", "electron-packager"), packagerArgs);
  } else if (existsSync(finalApp)) {
    // 离线环境没有 Electron ZIP 时，复用已验证的 Electron 外壳，只替换应用层资源。
    // 这样不会为了一次前端更新强制下载新运行时，也不会把旧的多个 App 重新复制到 release。
    const fallbackDirectory = join(packOutput, appDirectoryName);
    run("cp", ["-R", finalDirectory, fallbackDirectory]);
    cpSync(staging, join(fallbackDirectory, appName, "Contents", "Resources", "app"), { recursive: true, dereference: true });
    console.warn(`未找到 Electron ${electronVersion} 缓存，已复用现有 Mac 外壳完成离线覆盖。`);
  } else {
    throw new Error(`未找到 Electron ${electronVersion} 的本地 ZIP，且没有可复用的当前 App；请联网恢复 Electron 缓存后再打包。`);
  }
  run("codesign", ["--force", "--deep", "--sign", "-", stagingApp]);

  if (existsSync(finalDirectory)) {
    // 发布目录只保留一个当前版本。历史 App 不再自动复制到 release，避免每次打包都产生重复入口。
    // 用户数据位于应用支持目录，不在此发布目录内，因此替换不会影响工作区数据。
    rmSync(finalDirectory, { recursive: true, force: true });
  }
  renameSync(join(packOutput, appDirectoryName), finalDirectory);
  console.log(`精简 Mac 应用已生成：${finalApp}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
  rmSync(packOutput, { recursive: true, force: true });
}
