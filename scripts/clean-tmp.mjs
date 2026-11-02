// 清理测试与取证脚本留下的临时目录。
// 起因：测试用 mkdtempSync 建了目录却从不删，跑几十次后 TMPDIR 里堆了几百个
// （实测 353 个、80 GB），截图脚本 spawn 的 Electron 也会留下 profile 和孤儿进程。
import { readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `--all` 是跑完测试后的收尾：此时本机没有别的测试在跑，可以全清。
const MAX_AGE_MS = process.argv.includes("--all") ? 0 : 5 * 60 * 1000;
const PREFIXES = ["vas-"];
const now = Date.now();

let removed = 0;
let skipped = 0;
for (const name of readdirSync(tmpdir())) {
  if (!PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
  const target = join(tmpdir(), name);
  try {
    const { mtimeMs } = statSync(target);
    // 只删五分钟前的：避免误删正在跑的另一个测试进程的目录。
    if (now - mtimeMs < MAX_AGE_MS) {
      skipped += 1;
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    removed += 1;
  } catch {
    skipped += 1;
  }
}

console.log(`清理临时目录：删除 ${removed} 个，跳过 ${skipped} 个（${tmpdir()}）`);
