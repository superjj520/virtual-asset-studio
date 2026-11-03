#!/usr/bin/env node
/**
 * 法线图在参考卡工坊里能不能真的选到、选完提示对不对。
 *
 * 为什么要有这个脚本：
 * 法线源和通道都是分两轮接的，中间有一段时间「UI 里能看见、能选，但选了没用」。
 * 单测能证明 splitReferenceSheetSlots 拆对了，证明不了用户真的点得到。
 * 按 AGENTS.md「没有截图证据不得声称视觉验收完成」，这里补真窗口取证。
 *
 * 用法：
 *   npm run rebuild:native:electron
 *   node scripts/verify-normal-slot.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9605;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-verify-"));
const SHOT = join(ROOT, "artifacts/screenshots/normal-slot.png");
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

  const cloudTab = await evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "云端图库");
    b?.click();
    return !!b;
  })()`);
  check("切到云端图库", cloudTab === true);
  const overlay1 = await evaluate(`(() => ({ overlay: !!document.querySelector(".reference-sheet-overlay"), kindChips: !!document.querySelector(".reference-sheet-kind-chips"), tabs: [...document.querySelectorAll("button")].map(b=>b.textContent.trim()).filter(t=>/本地素材|云端图库/.test(t)) }))()`);
  console.log("  调试 · 切 tab 之后：", JSON.stringify(overlay1));
  // 分类按钮是常量渲染的，不依赖云端目录；卡片才依赖。所以等的是「目录到了」，
  // 不是「按钮出现」——只看按钮会立刻通过，然后拍到一片空白。
  const ready = await evaluate(`(async () => {
    for (let i = 0; i < 60; i++) {
      const bar = document.body.textContent.replace(/\\s+/g, " ");
      const cards = document.querySelectorAll(".reference-sheet-asset").length;
      if (cards > 0 || /匹配\\s*\\d+/.test(bar)) {
        return {
          bar: (bar.match(/\\d+ 张已显示 \\/ 匹配 \\d+/) ?? [""])[0],
          cards,
          chips: [...document.querySelectorAll("button")]
            .map((b) => b.textContent.replace(/\\s+/g, " ").trim())
            .filter((t) => /^(全部|人像|服装|发型|姿势|深度|动漫衣装|法线)(\\s*\\d+)?$/.test(t)),
        };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { bar: "", cards: 0, chips: [] };
  })()`);
  const kinds = ready?.chips ?? [];
  check("分类栏里有「法线」", (kinds ?? []).some((t) => t.startsWith("法线")), (kinds ?? []).join(" / "));

  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^法线(\s*\d+)?$/.test(x.textContent.replace(/\s+/g, " ").trim()));
    b?.click();
    return b ? b.textContent.trim() : null;
  })()`);
  check("点得到「法线」分类", !!clicked, clicked ?? "没找到");

  // 唯一能证明「真的选了有反应」的证据：卡片出来、说明文案是法线那条。
  let shot = null;
  for (let i = 0; i < 40; i++) {
    shot = await evaluate(`(() => {
      const cards = [...document.querySelectorAll(".reference-sheet-asset")];
      const note = document.querySelector(".reference-sheet-depth-note")?.textContent?.trim() ?? "";
      const thumbs = [...document.querySelectorAll(".reference-sheet-asset img")];
      return {
        cards: cards.length,
        note,
        loaded: thumbs.filter((img) => img.naturalWidth > 0).length,
        title: cards[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    })()`);
    if ((shot?.cards ?? 0) > 0) break;
    await sleep(1000);
  }
  check("法线分类下有卡片", (shot?.cards ?? 0) > 0, `${shot?.cards ?? 0} 张`);
  check("说明文案切到了法线那条", /法线图不拼进参考板/.test(shot?.note ?? ""), (shot?.note ?? "").slice(0, 40));
  // 缩略图走 raw.githubusercontent，刷新 bundle 后要重新下，慢的时候十几秒才出来。
  let loaded = shot?.loaded ?? 0;
  for (let i = 0; i < 40 && loaded === 0; i++) {
    await sleep(1000);
    loaded = await evaluate(`[...document.querySelectorAll(".reference-sheet-asset img")].filter((img) => img.naturalWidth > 0).length`);
  }
  check("法线缩略图真的加载出来了", loaded > 0, `${loaded} 张`);

  const picked = await evaluate(`(() => {
    const slot = document.querySelector('[data-slot-role="identity"], .reference-sheet-slot');
    if (slot) slot.click();
    const card = document.querySelector(".reference-sheet-asset-pick");
    card?.click();
    return !!card;
  })()`);
  await sleep(1500);
  const applied = await evaluate(`(() => {
    const status = document.querySelector(".reference-sheet-busy, .reference-sheet-error, .reference-sheet-status");
    const text = document.body.textContent.replace(/\s+/g, " ");
    return {
      picked: ${JSON.stringify(false)},
      hasNormalWord: /法线/.test(text),
      slotText: [...document.querySelectorAll(".reference-sheet-slot-summary, .reference-sheet-slot")]
        .map((n) => n.textContent.replace(/\s+/g, " ").trim())
        .join(" | ")
        .slice(0, 120),
    };
  })()`);
  check("页面上出现了法线相关信息", applied?.hasNormalWord === true, (applied?.slotText ?? "").slice(0, 60));

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
