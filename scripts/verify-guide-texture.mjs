#!/usr/bin/env node
/**
 * 「画面质感」在创作向导里能不能真的选到。
 *
 * 为什么单独一支：质感有两个入口——参考卡工坊（verify-texture.mjs 管的）和
 * 创作向导的四步流程。向导那条以前把「视觉质感」当标题、里面放的却是画风
 * （真实摄影/电影画面/时尚编辑/动漫视觉/概念设计），用户以为在选质感，
 * 实际写进提示词的是「具体视觉风格」，真正的「画面质感」段永远是空的。
 *
 * 这支脚本验的是修完之后：向导第四步同时有两组，画风归画风、质感归质感。
 *
 * 用法：
 *   npm run rebuild:native:electron
 *   node scripts/verify-guide-texture.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9609;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-guide-"));
const SHOT = join(ROOT, "artifacts/screenshots/guide-texture.png");
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
const WATCHDOG_MS = 500_000;
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

  const bundle = await evaluate(`document.querySelector("script[src]")?.getAttribute("src") ?? "none"`);
  check("加载的是本地构建的 bundle", /assets\/index-.*\.js$/.test(bundle), bundle);

  const clickContaining = async (needle) => evaluate(
    "(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(" +
    JSON.stringify(needle) + ")); if (!b) return false; b.click(); return true; })()"
  );

  check("找得到「单张画面」入口", await clickContaining("02单张画面"));
  await sleep(2500);

  // 向导四步：主体 → 造型 → 场景 → 确认。画面质感在第四步。
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    reached = await evaluate(`[...document.querySelectorAll("[role=group]")].some((g) => g.getAttribute("aria-label") === "快速画面质感")`);
    if (!reached) { await clickContaining("下一步"); await sleep(2200); }
  }
  check("走到生成前确认这一步", reached);

  const groups = await evaluate(`[...document.querySelectorAll("[role=group]")].map((g) => g.getAttribute("aria-label")).filter(Boolean)`);
  check("确认页有「快速画面质感」这一组", groups.includes("快速画面质感"), groups.join(" / "));
  // 画风和质感是两层，不能只剩一个名字。
  check("画风那组也还在（两者不互相顶替）", groups.includes("快速视觉质感"), groups.join(" / "));

  const options = await evaluate(`(() => {
    const g = [...document.querySelectorAll("[role=group]")].find((x) => x.getAttribute("aria-label") === "快速画面质感");
    return g ? [...g.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  })()`);
  check("质感选项数对得上（不指定 + 8 个预设）", options.length === 9, options.join(" / "));

  const pressed = await evaluate(`(() => {
    const g = [...document.querySelectorAll("[role=group]")].find((x) => x.getAttribute("aria-label") === "快速画面质感");
    const on = g ? [...g.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true") : [];
    return on.map((b) => b.textContent.trim());
  })()`);
  check("默认选中「不指定」", pressed.length === 1 && pressed[0] === "不指定", pressed.join(" / "));

  const clicked = await evaluate(`(() => {
    const g = [...document.querySelectorAll("[role=group]")].find((x) => x.getAttribute("aria-label") === "快速画面质感");
    if (!g) return false;
    const b = [...g.querySelectorAll("button")].find((x) => x.textContent.trim() === "胶片颗粒");
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check("点得到「胶片颗粒」", clicked);
  await sleep(600);

  const after = await evaluate(`(() => {
    const g = [...document.querySelectorAll("[role=group]")].find((x) => x.getAttribute("aria-label") === "快速画面质感");
    const on = g ? [...g.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true") : [];
    return on.map((b) => b.textContent.trim());
  })()`);
  check("选中态切到了「胶片颗粒」", after.length === 1 && after[0] === "胶片颗粒", after.join(" / "));

  const hint = await evaluate(`(() => {
    const heads = [...document.querySelectorAll(".visual-choice-heading")];
    const h = heads.find((x) => x.querySelector("strong")?.textContent.trim() === "画面质感");
    return h?.querySelector("span")?.textContent.trim() ?? "";
  })()`);
  check("说明文案跟着换了", hint.length > 4 && hint !== "颗粒、色偏与高光", hint);

  // 截图要拍到质感那一组，不能只拍到顶部的确认概览。
  await evaluate(`(() => {
    const g = [...document.querySelectorAll("[role=group]")].find((x) => x.getAttribute("aria-label") === "快速画面质感");
    g?.scrollIntoView({ block: "center" });
    return true;
  })()`);
  await sleep(700);
  const shot = await call("Page.captureScreenshot", { format: "png" });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, "base64"));
  check("截图已保存", true, SHOT);

  return summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length === 0) {
    console.log(`全部通过（${results.length} 项）`);
    return 0;
  }
  console.log(`✗ ${failed.length} 项未通过：`);
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  return 1;
}

main().then((code) => { cleanup(); process.exit(code); }).catch((e) => {
  console.error("✗", e.message);
  cleanup();
  process.exit(bail);
});
