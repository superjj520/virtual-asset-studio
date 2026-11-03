#!/usr/bin/env node
/**
 * 把云端素材库全量下载进用户的真实数据目录。
 *
 * 和 verify-import-all.mjs 的区别就在一个参数：这个**不传** --user-data-dir，
 * 所以 Electron 用的是默认的 ~/Library/Application Support/virtual-asset-studio。
 * 用户要的是「资源自己保管，后续本地服务能调用」，下到临时 profile 里等于白跑。
 *
 * 跑法：node scripts/download-all.mjs [--kinds=pose,costume,...] [--concurrency=8]
 *
 * 断点续传是 importAll 自带的：已经下过的按 metadata.cloudReference.itemId 跳过，
 * 中途断了重跑会接着下，不会重复入库。
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 9342;
// 一万张图，并发 8，上游限速时单张可能几秒——按最长 90 分钟兜底。
const WATCHDOG_MS = 90 * 60 * 1000;

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const CONCURRENCY = Number(argOf("concurrency", "8"));
const KINDS = argOf("kinds", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let child;
let ws;
const started = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const elapsed = () => {
  const s = Math.round((Date.now() - started) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function shutdown(code) {
  try { ws?.close(); } catch {}
  if (child?.pid) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    try { child.kill("SIGKILL"); } catch {}
  }
  process.exit(code);
}

const watchdog = setTimeout(() => {
  console.log("\n看门狗超时（90 分钟），强制退出。已下的不会丢，重跑会接着下。");
  shutdown(1);
}, WATCHDOG_MS);

let nextId = 1;
const pending = new Map();

function send(method, params = {}, timeout = 600_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} 超时`));
    }, timeout);
  });
}

async function evaluate(expression, timeout = 600_000) {
  const res = await send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    timeout,
  );
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "页面执行出错");
  }
  return res.result?.value;
}

async function main() {
  child = spawn(
    join(ROOT, "node_modules/.bin/electron"),
    [".", `--remote-debugging-port=${PORT}`],
    {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
    },
  );

  let target;
  for (let i = 0; i < 90 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
      target =
        pages.find((t) => /virtual-asset|虚拟资产|dist\/index\.html/i.test(`${t.title} ${t.url}`)) ??
        pages.find((t) => t.url.startsWith("file://"));
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) {
    console.log("✗ 应用起不来，没找到可调试的页面");
    return shutdown(1);
  }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  await send("Runtime.enable", {});

  await evaluate(`
    new Promise((resolve) => {
      if (window.studio) return resolve(true);
      const t = setInterval(() => { if (window.studio) { clearInterval(t); resolve(true); } }, 100);
      setTimeout(() => { clearInterval(t); resolve(false); }, 20000);
    })
  `);
  if (!(await evaluate("Boolean(window.studio?.referenceLibrary?.importAll)"))) {
    console.log("✗ preload 没暴露 importAll");
    return shutdown(1);
  }

  const before = await evaluate(`
    (async () => {
      const catalog = await window.studio.referenceLibrary.list();
      return { items: catalog.totalItems, images: catalog.totalImages, kinds: catalog.counts };
    })()
  `);
  console.log(`目录：${before.items} 条 / ${before.images} 张`);
  console.log(`分类：${JSON.stringify(before.kinds)}`);
  if (KINDS.length) console.log(`只下这几类：${KINDS.join(", ")}`);
  console.log(`并发 ${CONCURRENCY}，写到 ~/Library/Application Support/virtual-asset-studio/`);
  console.log("开始下载…（Ctrl-C 可以停，已经下完的会保留）\n");

  // 进度不能靠 importAll 的 onProgress 参数：它要过 IPC，函数传不过去。
  // 主进程自己构造 onProgress 并通过事件推回来，所以这里订阅事件。
  // 不在这里 await importAll：一万张图要跑十几分钟，CDP 的 awaitPromise 撑不了那么久。
  await evaluate(`
    (() => {
      window.__dl = { phase: "starting", done: 0, total: 0, imported: 0, skipped: 0, failed: 0 };
      window.studio.referenceLibrary.onImportProgress((state) => {
        window.__dl = { phase: "running", ...state };
      });
      window.studio.referenceLibrary
        .importAll({
          concurrency: ${CONCURRENCY},
          ${KINDS.length ? `kinds: ${JSON.stringify(KINDS)},` : ""}
        })
        .then((summary) => { window.__dl = { phase: "done", ...summary }; })
        .catch((error) => { window.__dl = { phase: "error", error: String(error) }; });
      return true;
    })()
  `);

  let lastLine = "";
  let quiet = 0;
  for (;;) {
    await sleep(5000);
    let state;
    try {
      state = await evaluate("window.__dl", 30_000);
    } catch {
      // 页面在忙时偶尔读不到，不算失败。
      quiet += 1;
      if (quiet > 40) {
        console.log("\n✗ 连续 200 秒读不到进度，可能页面挂了");
        return shutdown(1);
      }
      continue;
    }
    quiet = 0;
    if (!state) continue;

    if (state.phase === "error") {
      console.log(`\n✗ 下载出错：${state.error}`);
      return shutdown(1);
    }

    if (state.phase === "done") {
      console.log(`\r${" ".repeat(lastLine.length)}\r`);
      console.log("下载完成：");
      console.log(`  新增 ${state.imported} 张，跳过 ${state.skipped} 张（已在本地），失败 ${state.failed} 张`);
      const after = await evaluate(`
        (async () => {
          const catalog = await window.studio.referenceLibrary.list();
          const assets = await window.studio.assets.list({});
          const refs = (assets ?? []).filter((a) => a.type === "reference_image");
          return { items: catalog.totalItems, images: catalog.totalImages, refs: refs.length };
        })()
      `).catch(() => null);
      if (after) {
        console.log(`  资产库里 reference_image：${after.refs} 条`);
      }
      console.log(`\n耗时 ${elapsed()}。数据在 ~/Library/Application Support/virtual-asset-studio/`);
      return shutdown(state.failed > 0 ? 2 : 0);
    }

    const total = state.total || 0;
    const done = state.done || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = total
      ? `${"█".repeat(Math.round(pct / 4))}${"░".repeat(25 - Math.round(pct / 4))}`
      : "░".repeat(25);
    const line =
      `${bar} ${String(pct).padStart(3)}%  ${done}/${total}  ` +
      `新增 ${state.imported ?? 0}  跳过 ${state.skipped ?? 0}  失败 ${state.failed ?? 0}  ` +
      `${elapsed()}`;
    lastLine = line;
    process.stdout.write(`\r${line}${state.currentTitle ? "  ← " + state.currentTitle.slice(0, 24) : ""}   `);
  }
}

main().catch((error) => {
  console.log(`\n✗ ${error?.stack ?? error}`);
  shutdown(1);
});
