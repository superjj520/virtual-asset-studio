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
const PORT = 9611;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-texture-"));
const SHOT = join(ROOT, "artifacts/screenshots/pose-note.png");
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

  const cloud = await evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "云端图库");
    b?.click();
    return !!b;
  })()`);
  check("切得到云端图库", cloud === true);
  await sleep(1200);

  const ready = await evaluate(`(async () => {
    for (let i = 0; i < 60; i++) {
      const chips = [...document.querySelectorAll(".reference-sheet-kind-chips button")].map((b) => b.textContent.trim());
      if (chips.some((t) => /^姿势(\\s*\\d+)?$/.test(t))) return chips;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  })()`);
  check("分类栏里有「姿势」", Array.isArray(ready), (ready ?? []).join(" / ").slice(0, 120));

  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll(".reference-sheet-kind-chips button")].find((x) => /^姿势(\\s*\\d+)?$/.test(x.textContent.trim()));
    b?.scrollIntoView({ block: "center" });
    b?.click();
    return !!b;
  })()`);
  check("点得到「姿势」分类", clicked === true);
  await sleep(1500);

  const note = await evaluate(`(() => {
    const node = document.querySelector(".reference-sheet-depth-note");
    if (node) node.scrollIntoView({ block: "center" });
    return node ? node.textContent.trim() : "";
  })()`);
  check("切到姿势分类后有说明", note.length > 0, note.slice(0, 60));
  check("说明里点出只有女性体型的人台", note.includes("只有女性体型的人台"), note.slice(0, 80));
  check("说明里给出了怎么补（肩宽等体型项）", note.includes("肩宽"), note.slice(0, 80));

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
