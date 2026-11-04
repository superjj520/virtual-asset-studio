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
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODES = join(ROOT, "comfyui-vas-nodes");
const PYTHON = process.env.PYTHON ?? "python3";
const online = process.argv.includes("--online");
// live_test.py 要 import torch，只有装过 ComfyUI 依赖的解释器才跑得动。
// 本机默认指向 /tmp/comfy-venv（见 docs 里的重建步骤），没有就跳过这一项。
const LIVE_PYTHON = process.env.LIVE_PYTHON ?? "/tmp/comfy-venv/bin/python";
const hasLive = existsSync(LIVE_PYTHON);

const steps = [
  { name: "节点契约（ComfyUI 能不能加载）", cmd: PYTHON, args: [join(NODES, "contract_test.py")] },
  { name: "与 anhao 插件的参数/输出对照", cmd: PYTHON, args: [join(NODES, "parity_test.py")] },
  { name: "提示词与画风预设", cmd: PYTHON, args: [join(NODES, "prompt_test.py")] },
  { name: "姿势→深度匹配", cmd: PYTHON, args: [join(NODES, "depth_test.py")] },
  { name: "图库路由", cmd: PYTHON, args: [join(NODES, "routes_test.py")] },
  { name: "前端选图弹窗", cmd: process.execPath, args: [join(NODES, "web/gallery_smoke.mjs")] },
];
if (hasLive) {
  // ComfyUI 没起时这个脚本自己打印「跳过」并返回 0，所以不必在这里判断端口。
  steps.push({ name: "在真 ComfyUI 里跑参考板节点", cmd: LIVE_PYTHON, args: [join(NODES, "live_test.py")] });
  // 上面那支用 PIL 合成假图，验的是节点本身；这一支才真的挂 checkpoint 出图。
  // 没装 checkpoint 时它自己跳过并返回 0。
  steps.push({ name: "真模型出图", cmd: LIVE_PYTHON, args: [join(NODES, "e2e_test.py")] });
}
if (online) {
  steps.push({ name: "六个上游源的条数（需要网络）", cmd: PYTHON, args: [join(NODES, "selftest.py")] });
}

let failed = 0;
let skipped = 0;
// 退出码 0 不等于「真跑过」：live_test / e2e_test 在 ComfyUI 没起、checkpoint
// 没装时会自己打印「跳过」并返回 0。以前这种也算 ✓，八项全绿其实有两项没跑，
// 这跟「不是应付」是反的。现在把「跳过」单独标出来，也不计入通过的项数。
for (const step of steps) {
  const result = spawnSync(step.cmd, step.args, { cwd: ROOT, encoding: "utf8" });
  const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const ok = result.status === 0;
  const didSkip = ok && /跳过/.test(raw);
  if (!ok) failed += 1;
  else if (didSkip) skipped += 1;
  const mark = ok ? (didSkip ? "⊘" : "✓") : "✗";
  console.log(`${mark} ${step.name}`);
  if (!ok) {
    if (raw) console.log(raw.split("\n").slice(-6).map((line) => `    ${line}`).join("\n"));
  } else if (didSkip) {
    const why = raw.split("\n").find((line) => line.includes("跳过")) ?? "";
    console.log(`    ${why.trim()}`);
  }
}

if (!online) console.log("（跳过了需要网络的上游检查，加 --online 一起跑）");
const ran = steps.length - skipped;
console.log(
  failed === 0
    ? `\n全部通过（${ran} 项${skipped ? `，另有 ${skipped} 项因环境缺失跳过` : ""}）`
    : `\n${failed} 项失败（共 ${steps.length} 项${skipped ? `，${skipped} 项跳过` : ""}）`,
);
process.exit(failed === 0 ? 0 : 1);
