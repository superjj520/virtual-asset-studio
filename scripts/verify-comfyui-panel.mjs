#!/usr/bin/env node
/**
 * 设置页 ComfyUI 参数面板的真机验收。
 *
 * 为什么要有这个脚本：
 * 之前每次都临时写一个 /tmp 里的 CDP 脚本，跑完不退出（ws 和 child 句柄挂着事件循环），
 * 于是「卡死 10 分钟 → pkill → 重试」成了常态，还留下过 16 个孤儿 Electron。
 * 现在固化成一条命令：跑完一定退出，退出码说话。
 *
 * 用法：
 *   npm run rebuild:native:electron   # npm test 会把 better-sqlite3 重建成 node ABI，必须先切回 electron
 *   node scripts/verify-comfyui-panel.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞（起不来、CDP 连不上）
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9601;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-"));
const SHOT = join(ROOT, "artifacts/screenshots/comfyui-parameters.png");
const STEP_TIMEOUT = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 示例工作流：故意把三条控件全写在 node 3 的 _meta 里，其中 batch_size 指向 node 5。 */
const SAMPLE = {
  "3": {
    class_type: "KSampler",
    inputs: { seed: "{{seed}}", steps: "{{steps}}", cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] },
    _meta: {
      title: "采样器",
      studio: {
        controls: [
          { input: "cfg", label: "CFG 强度", group: "采样", description: "越高越贴提示词" },
          { input: "sampler_name", label: "采样器", group: "采样", options: [{ value: "euler", label: "Euler" }, { value: "dpmpp_2m", label: "DPM++ 2M" }] },
          { input: "batch_size", node: "5", label: "每批张数", group: "尺寸" },
        ],
      },
    },
  },
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{checkpoint}}" } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "{{negative}}" } },
  "8": { class_type: "VAEDecode", inputs: {} },
  "9": { class_type: "SaveImage", inputs: { filename_prefix: "vas", images: ["8", 0] } },
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let child;
let ws;
let bail = 2;

const watchdog = setTimeout(() => {
  console.error("✗ 超时 240s，强制退出（这本身就是失败）");
  cleanup();
  process.exit(2);
}, 240_000);

function cleanup() {
  clearTimeout(watchdog);
  try { ws?.close(); } catch {}
  if (child?.pid) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    try { child.kill("SIGKILL"); } catch {}
  }
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

async function main() {
  child = spawn(join(ROOT, "node_modules/.bin/electron"), [".", `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });

  let target;
  for (let i = 0; i < 90 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
      target = pages.find((t) => /virtual-asset|虚拟资产|dist\/index\.html/i.test(`${t.title} ${t.url}`))
        ?? pages.find((t) => t.url.startsWith("file://"));
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) {
    console.error("✗ CDP target 未就绪：先跑 npm run rebuild:native:electron");
    return 2;
  }
  bail = 1;

  ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    setTimeout(() => rej(new Error("ws 连接超时")), STEP_TIMEOUT);
  });

  /** 每次 CDP 调用都带超时，避免某一个请求挂住整个脚本。 */
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, STEP_TIMEOUT);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
    return r.result?.value;
  };

  await call("Runtime.enable");
  await call("Page.enable");
  await sleep(4000);

  // 核对加载的是刚构建的 bundle，不是旧进程缓存
  const bundle = await evaluate(`document.querySelector("script[src]")?.getAttribute("src") ?? "none"`);
  check("加载的是本地构建的 bundle", /assets\/index-.*\.js$/.test(bundle), bundle);

  const opened = await evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="设置"); b?.click(); return !!b; })()`);
  check("进入设置页", opened === true);
  await sleep(2000);

  const filled = await evaluate(`(() => {
    const ta = [...document.querySelectorAll("textarea")].find(t => t.getAttribute("aria-label")?.includes("工作流"))
      ?? [...document.querySelectorAll("textarea")].at(-1);
    if (!ta) return { miss: "no textarea" };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, ${JSON.stringify(JSON.stringify(SAMPLE))});
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true, label: ta.getAttribute("aria-label") };
  })()`);
  check("填入工作流 JSON", filled?.ok === true, filled?.label ?? filled?.miss ?? "");
  await sleep(2500);

  const panel = await evaluate(`(() => {
    const box = document.querySelector(".comfyui-parameters");
    if (!box) return { miss: "no panel" };
    const rows = [...box.querySelectorAll(".comfyui-parameter")].map(r => r.textContent.replace(/\\s+/g, " ").trim());
    const stale = box.querySelector(".comfyui-stale, [data-stale]")?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
    return { count: rows.length, rows, stale };
  })()`);
  check("参数面板渲染出来了", (panel?.count ?? 0) > 0, `${panel?.count ?? 0} 个可调参数`);

  const rows = panel?.rows ?? [];
  check("声明了中文名的参数显示中文", rows.some((r) => r.includes("CFG 强度")), rows.find((r) => r.includes("CFG")) ?? "");
  check("枚举参数显示可读标签", rows.some((r) => r.includes("Euler") || r.includes("DPM++")));
  check("跨节点声明（batch_size 指向 5）显示为「每批张数」", rows.some((r) => r.includes("每批张数")));
  check("跨节点声明不再被误报为「元数据过期」", !(panel?.stale ?? "").includes("batch_size"), panel?.stale ?? "(无警告)");

  const placeholders = await evaluate(`(() => {
    const box = document.querySelector(".comfyui-parameters");
    if (!box) return [];
    return [...box.querySelectorAll(".comfyui-parameter")].map(r => r.textContent).filter(t => /\\{\\{/.test(t));
  })()`);
  check("占位符字段不生成控件", (placeholders?.length ?? 0) === 0, (placeholders ?? []).join(" | ") || "无占位符字段");

  const help = await evaluate(`(() => {
    const d = document.querySelector(".comfyui-controls-help");
    if (!d) return { miss: "no help" };
    return { open: d.open, summary: d.querySelector("summary")?.textContent?.trim() ?? "" };
  })()`);
  check("「怎么让参数面板显示中文名」的说明在页面上", !!help?.summary, help?.summary ?? help?.miss ?? "");

  const changed = await evaluate(`(() => {
    const row = [...document.querySelectorAll(".comfyui-parameter")].find(r => r.textContent.includes("CFG"));
    if (!row) return { miss: "no cfg row" };
    const input = row.querySelector("input");
    if (!input) return { miss: "no input" };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "12");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, now: input.value };
  })()`);
  check("改 CFG 的值能落到控件上", changed?.now === "12", `now=${changed?.now ?? changed?.miss}`);
  await sleep(1000);

  await evaluate(`(() => { const el = document.querySelector(".comfyui-parameters"); el?.scrollIntoView({ block: "center" }); return !!el; })()`);
  await sleep(600);

  mkdirSync(dirname(SHOT), { recursive: true });
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(SHOT, Buffer.from(shot.data, "base64"));
  check("截图已保存", true, SHOT);
}

try {
  await main();
} catch (e) {
  check("执行断言", false, e.message);
}

cleanup();
const failed = results.filter((r) => !r.ok);
if (!results.length) {
  console.log("\n环境阻塞，一条断言都没跑起来");
  process.exit(2);
}
console.log(`\n${failed.length === 0 ? "✓ 全部通过" : `✗ ${failed.length} 项失败`}（共 ${results.length} 项）`);
process.exit(failed.length === 0 ? 0 : 1);
