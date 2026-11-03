#!/usr/bin/env node
/**
 * ComfyUI 节点包的一次性验证。
 *
 * 这些检查原本散在命令行里，每次要手打五条命令，跑完还得自己看有没有 ✗。
 * 收成一条 `npm run verify:nodes`，退出码非 0 就说明有东西坏了。
 *
 * 默认不连网：selftest.py 要拉六个上游，只在 --online 时跑。
 * 需要真 torch 的检查（真的编码一张图）不在范围内——本机没有 GPU 模型。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODES = join(ROOT, "comfyui-vas-nodes");
const PYTHON = process.env.PYTHON ?? "python3";
const online = process.argv.includes("--online");

const steps = [
  { name: "节点契约（ComfyUI 能不能加载）", cmd: PYTHON, args: [join(NODES, "contract_test.py")] },
  { name: "与 anhao 插件的参数/输出对照", cmd: PYTHON, args: [join(NODES, "parity_test.py")] },
  { name: "提示词与画风预设", cmd: PYTHON, args: [join(NODES, "prompt_test.py")] },
  { name: "姿势→深度匹配", cmd: PYTHON, args: [join(NODES, "depth_test.py")] },
  { name: "图库路由", cmd: PYTHON, args: [join(NODES, "routes_test.py")] },
  { name: "前端选图弹窗", cmd: process.execPath, args: [join(NODES, "web/gallery_smoke.mjs")] },
];
if (online) {
  steps.push({ name: "六个上游源的条数（需要网络）", cmd: PYTHON, args: [join(NODES, "selftest.py")] });
}

let failed = 0;
for (const step of steps) {
  const result = spawnSync(step.cmd, step.args, { cwd: ROOT, encoding: "utf8" });
  const ok = result.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${step.name}`);
  if (!ok) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (detail) console.log(detail.split("\n").slice(-6).map((line) => `    ${line}`).join("\n"));
  }
}

if (!online) console.log("（跳过了需要网络的上游检查，加 --online 一起跑）");
console.log(failed === 0 ? `\n全部通过（${steps.length} 项）` : `\n${failed} 项失败（共 ${steps.length} 项）`);
process.exit(failed === 0 ? 0 : 1);
