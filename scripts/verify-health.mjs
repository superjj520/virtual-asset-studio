#!/usr/bin/env node
/**
 * 设置页「素材库体检」的真机验收。
 *
 * 为什么要有这个脚本：
 * R50 给体检加了抽样档位（3/10/20/50 张），但只写了单测，没在真窗口里看过控件长什么样。
 * 按 AGENTS.md「没有截图证据不得声称视觉验收完成」，这里补上可复现的取证。
 *
 * 会真联网拉七个上游，最长等 180 秒（每源抽 10 张 = 70 个图片请求，上游限速时会慢）。
 * 法线源（Shisei · CC0）失败时会降级为 0 条，不拖垮其余六源，所以总数按「至少 6980」判。
 *
 * 用法：
 *   npm run rebuild:native:electron
 *   node scripts/verify-health.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9603;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-"));
const SHOT = join(ROOT, "artifacts/screenshots/cloud-health-sample.png");
/**
 * 单步超时。health() 现在要等七个源，其中 raw.githubusercontent 限速时
 * 每张图能拖到 20 秒；一次抽 10 张并发，留 120 秒才不会被误判成「卡死」。
 */
const STEP_TIMEOUT = 120_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let child;
let ws;
const WATCHDOG_MS = 320_000;
let bail = 2;

const watchdog = setTimeout(() => {
  console.error(`✗ 超时 ${Math.round(WATCHDOG_MS / 1000)}s，强制退出（这本身就是失败）`);
  cleanup();
  process.exit(2);
}, WATCHDOG_MS);

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

  const control = await evaluate(`(() => {
    const box = document.querySelector(".cloud-health-sample");
    if (!box) return { miss: "no .cloud-health-sample" };
    const select = box.querySelector("select");
    if (!select) return { miss: "no select" };
    const options = [...select.options].map(o => o.value);
    return { text: box.textContent.replace(/\s+/g, " ").trim(), options, value: select.value };
  })()`);
  check("抽样档位控件在页面上", !!control?.options, control?.text ?? control?.miss ?? "");
  check("档位有 3 / 10 / 20 / 50 四档", JSON.stringify(control?.options) === JSON.stringify(["3","10","20","50"]), JSON.stringify(control?.options ?? []));

  const picked = await evaluate(`(() => {
    const select = document.querySelector(".cloud-health-sample select");
    if (!select) return { miss: "no select" };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, "10");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, now: select.value };
  })()`);
  check("能切到每源抽 10 张", picked?.now === "10", `now=${picked?.now ?? picked?.miss}`);

  // 直接调 IPC 验证 sampleSize 真的透传到服务层（比等 UI 跑 70 个图片请求可靠）。
  // 先预热一次：首次调用要现拉七个上游，上游偶发慢的时候会吃掉 evaluate 的等待，
  // 预热后的两次调用走缓存，量的就纯粹是 sampleSize 有没有透传。
  await evaluate(`(async () => { try { await window.studio?.referenceLibrary?.health?.(); } catch {} return true; })()`);
  const viaIpc = await evaluate(`(async () => {
    const api = window.studio?.referenceLibrary?.health;
    if (typeof api !== "function") return { miss: "no health api" };
    const three = await api();
    const ten = await api(10);
    const sources = ten?.sources ?? [];
    const normal = sources.find((row) => /法线/.test(row.label ?? ""));
    return {
      three: three?.sources?.[0]?.images?.length ?? -1,
      ten: ten?.sources?.[0]?.images?.length ?? -1,
      total: ten?.totalItems ?? -1,
      labels: sources.map((row) => row.label),
      normalCount: normal?.count ?? -1,
    };
  })()`);
  check("默认档位真的抓 3 张", viaIpc?.three === 3, `images=${viaIpc?.three ?? viaIpc?.miss}`);
  check("传 10 时真的抓 10 张（IPC 透传生效）", viaIpc?.ten === 10, `images=${viaIpc?.ten}`);
  // 法线是这一轮新接的第七个源，单独断言它——不跟着其他六源的网络抖动一起红。
  check(
    "法线源在体检列表里",
    Array.isArray(viaIpc?.labels) && viaIpc.labels.some((label) => /法线/.test(label ?? "")),
    `labels=${(viaIpc?.labels ?? []).join("|")}`,
  );
  check("法线源 944 张", viaIpc?.normalCount === 944, `count=${viaIpc?.normalCount}`);
  check(
    "体检总数对得上",
    (viaIpc?.total ?? 0) >= 6980,
    `totalItems=${viaIpc?.total}（六源 6980 + 法线 944）`,
  );

  const clicked = await evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="开始体检"); b?.click(); return !!b; })()`);
  check("点到了「开始体检」", clicked === true);

  let rows = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const n = await evaluate(`document.querySelectorAll(".cloud-health-table tbody tr").length`);
    if (typeof n === "number" && n > 0) { rows = n; break; }
  }
  check("体检结果表格出来了", rows > 0, `${rows} 行`);

  const detail = await evaluate(`(() => {
    const trs = [...document.querySelectorAll(".cloud-health-table tbody tr")];
    return trs.map(tr => tr.textContent.replace(/\s+/g, " ").trim());
  })()`);
  check("七个来源都有结果", (detail?.length ?? 0) === 7, (detail ?? []).join(" | ").slice(0, 220));
  check("每个来源都带条数", (detail ?? []).every((t) => /[0-9]/.test(t)));

  await evaluate(`(() => { const el = document.querySelector(".cloud-health-table"); el?.scrollIntoView({ block: "center" }); return !!el; })()`);
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
