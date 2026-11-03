#!/usr/bin/env node
/**
 * 一次跑完全部验证，按正确的顺序。
 *
 * 顺序不是随便排的：`npm test` 会把 better-sqlite3 重建成 Node ABI，
 * 而 GUI 验证与打包需要 Electron ABI。反过来先打包再跑测试，
 * 测试会全红（NODE_MODULE_VERSION 139 vs 127）。
 * 之前手动串这几条命令时踩过：GUI 验证报「环境阻塞」，
 * 或者并发跑导致 vitest worker 通信超时、四个不相关测试一起挂。
 *
 * 用法：
 *   node scripts/verify-all.mjs            # 不联网
 *   node scripts/verify-all.mjs --online   # 带上六个上游源
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ONLINE = process.argv.includes("--online");

const steps = [
  { name: "单元测试", cmd: "npm", args: ["test"], need: "node" },
  { name: "构建", cmd: "npm", args: ["run", "build"] },
  { name: "切回 Electron 原生模块", cmd: "npm", args: ["run", "rebuild:native:electron"] },
  { name: "参数面板真机", cmd: "node", args: ["scripts/verify-comfyui-panel.mjs"] },
  { name: "素材库体检真机", cmd: "node", args: ["scripts/verify-health.mjs"] },
  { name: "素材库质量真机", cmd: "node", args: ["scripts/reference-quality.mjs"] },
  { name: "法线槽位真机", cmd: "node", args: ["scripts/verify-normal-slot.mjs"] },
  { name: "节点包七项", cmd: "node", args: ["scripts/verify-nodes.mjs", ...(ONLINE ? ["--online"] : [])] },
  { name: "打包", cmd: "npm", args: ["run", "package:mac"] },
  { name: "重启恢复", cmd: "npm", args: ["run", "smoke:restore"] },
  { name: "收尾切回 Node 原生模块", cmd: "npm", args: ["run", "rebuild:native:node"] },
];

const results = [];
let failed = 0;

for (const [index, step] of steps.entries()) {
  process.stdout.write(`\n=== ${index + 1}/${steps.length} ${step.name} ===\n`);
  const started = Date.now();
  const result = spawnSync(step.cmd, step.args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const ok = result.status === 0;
  if (!ok) failed += 1;
  results.push({ name: step.name, ok, seconds });
}

process.stdout.write("\n=== 汇总 ===\n");
for (const row of results) {
  process.stdout.write(`${row.ok ? "✓" : "✗"} ${row.name}（${row.seconds}s）\n`);
}

const release = join(ROOT, "release/虚拟资产创作工作台-darwin-arm64/虚拟资产创作工作台.app");
process.stdout.write(`\n正式应用：${existsSync(release) ? "在位" : "缺失"}\n`);
process.stdout.write(failed === 0 ? "全部通过\n" : `${failed} 步失败\n`);
process.exit(failed === 0 ? 0 : 1);
