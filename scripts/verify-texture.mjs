#!/usr/bin/env node
/**
 * 「画面质感」在参考卡工坊里能不能真的选到、选了有没有写进提示词。
 *
 * 为什么要有这个脚本：
 * 质感是照竞品实测补的一层（docs/R55-PROMPT-COMPETITOR-TRUEJPEG.md），
 * 单测能证明它被写进 positive 的「画面质感：」那一段，证明不了用户真的点得到。
 * 按 AGENTS.md「没有截图证据不得声称视觉验收完成」，这里补真窗口取证。
 *
 * 用法：
 *   npm run rebuild:native:electron
 *   node scripts/verify-texture.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9607;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-texture-"));
const SHOT = join(ROOT, "artifacts/screenshots/texture-presets.png");
/**
 * 单步超时。health() 现在要等七个源，其中 raw.githubusercontent 限速时
 * 每张图能拖到 20 秒；一次抽 10 张并发，留 120 秒才不会被误判成「卡死」。
 */
const STEP_TIMEOUT = 200_000;

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

  // 参考卡工坊的入口在创作域的「参考卡组合」按钮上。
  const entry = await evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "参考卡组合");
    b?.click();
    return !!b;
  })()`);
  check("找得到参考卡组合入口", entry === true);
  if (!entry) return finish();
  await sleep(2500);

  const overlay = await evaluate(`(() => ({
    overlay: !!document.querySelector(".reference-sheet-overlay"),
    groups: [...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute("aria-label")),
  }))()`);
  check("参考卡工坊抽屉打开了", overlay.overlay === true);
  check(
    "抽屉里有「画面质感」这一组",
    (overlay.groups ?? []).includes("画面质感"),
    (overlay.groups ?? []).join(" / "),
  );

  // 九个按钮：不指定 + 八个预设。
  const labels = await evaluate(`(() => {
    const group = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "画面质感");
    return group ? [...group.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  })()`);
  check("质感选项数对得上（不指定 + 8 个预设）", labels.length === 9, labels.join(" / "));
  check("选项里能看见 CCD 直闪", labels.includes("CCD 直闪"), labels.join(" / "));

  // 默认是「不指定」。
  const initial = await evaluate(`(() => {
    const group = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "画面质感");
    return group ? [...group.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()) : [];
  })()`);
  check("默认选中「不指定」", initial.length === 1 && initial[0] === "不指定", initial.join(" / "));

  // 点「CCD 直闪」。
  const picked = await evaluate(`(() => {
    const group = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "画面质感");
    const button = group ? [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === "CCD 直闪") : undefined;
    button?.scrollIntoView({ block: "center" });
    button?.click();
    return !!button;
  })()`);
  check("点得到「CCD 直闪」", picked === true);
  await sleep(600);

  const after = await evaluate(`(() => {
    const group = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "画面质感");
    const pressed = group ? [...group.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()) : [];
    const head = document.querySelectorAll(".reference-sheet-style-head");
    const summaries = [...head].map((node) => node.textContent.trim());
    return { pressed, summaries };
  })()`);
  check(
    "选中态切到了「CCD 直闪」",
    after.pressed.length === 1 && after.pressed[0] === "CCD 直闪",
    after.pressed.join(" / "),
  );
  check(
    "说明文案跟着换了",
    (after.summaries ?? []).some((text) => text.includes("2000s 便携数码直闪")),
    (after.summaries ?? []).join(" | ").slice(0, 120),
  );

  const shot = await evaluate(`(() => {
    const target = document.querySelector(".reference-sheet-overlay");
    if (target) target.scrollTop = target.scrollHeight;
    return true;
  })()`);
  await sleep(500);
  const shotData = await call("Page.captureScreenshot", { format: "png" });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shotData.data, "base64"));
  check("截图已保存", true, SHOT);

  return finish();
}


function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log();
  if (failed.length) {
    console.log(`✗ ${failed.length} 项未通过：`);
    for (const f of failed) console.log(`  - ${f.name}`);
    return 1;
  }
  console.log(`全部通过（${results.length} 项）`);
  return 0;
}

main()
  .then((code) => { cleanup(); process.exit(code); })
  .catch((error) => {
    console.error("✗ 运行失败：", error instanceof Error ? error.message : error);
    cleanup();
    process.exit(1);
  });
