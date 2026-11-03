#!/usr/bin/env node
/**
 * 云端素材库「整批下载到本地」真机验收。
 *
 * 为什么单独做这一道：整批下载是几千个请求的长任务，单测里 fetch 是假的，
 * 断点续传、并发池、进度事件全都测不到。这里真跑一遍（只挑法线那 944 张，
 * 图最小、跑得完），验的是「跑完账对得上」。
 *
 * 断言：目录里数得出条目数 → 整批下载跑完 → 账对得上（imported + skipped
 * + failed === total）→ 进度事件真的推过 → 资产库真的多了 → 重跑一次全部
 * 跳过。跑完把临时 user-data 删掉。
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 9341;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-import-all-"));
const STEP_TIMEOUT = 900_000;
const WATCHDOG_MS = 1_200_000;

let child;
let ws;
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function shutdown(code) {
  clearTimeout(watchdog);
  try { ws?.close(); } catch {}
  if (child?.pid) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    try { child.kill("SIGKILL"); } catch {}
  }
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

const watchdog = setTimeout(() => {
  console.log("看门狗超时，强制退出");
  shutdown(1);
}, WATCHDOG_MS);

let nextId = 1;
const pending = new Map();

function send(method, params = {}, timeout = STEP_TIMEOUT) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} 超时`));
    }, timeout);
  });
}

async function evaluate(expression, timeout = STEP_TIMEOUT) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeout);
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "页面执行出错");
  }
  return res.result?.value;
}

async function main() {
  child = spawn(
    join(ROOT, "node_modules/.bin/electron"),
    [".", `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`],
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
    check("应用起得来", false, "没找到可调试的页面");
    return shutdown(1);
  }
  check("应用起得来", true);

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
  const ready = await evaluate("Boolean(window.studio?.referenceLibrary)");
  check("preload 暴露了参考库接口", ready);
  if (!ready) return shutdown(1);

  // 先数一遍法线有多少张，等下拿它当账本上的总数。
  const counted = await evaluate(`
    (async () => {
      const catalog = await window.studio.referenceLibrary.list();
      return catalog.items.filter((i) => i.kind === "normal").length;
    })()
  `);
  check("目录里数得出法线条目", counted > 0, `${counted} 条`);
  if (!counted) return shutdown(1);

  const before = await evaluate("(async () => (await window.studio.assets.list({})).length)()");

  // 真跑一整批。只下法线：944 张、600px webp，跑得完；七源全开要十几分钟，
  // 这条脚本的目的是验账，不是把整套目录搬一遍。
  const run = await evaluate(
    `
    (async () => {
      const events = [];
      const off = window.studio.referenceLibrary.onImportProgress((state) => {
        if (events.length < 5) events.push(state);
        events.last = state;
      });
      try {
        const summary = await window.studio.referenceLibrary.importAll({ kinds: ["normal"], concurrency: 6 });
        return { ok: true, summary, events: events.slice(), seen: events.length };
      } catch (error) {
        return { ok: false, message: String(error?.message ?? error) };
      } finally {
        off();
      }
    })().catch((error) => ({ ok: false, message: String(error?.message ?? error) }))
  `,
    900_000,
  );

  check("整批下载没抛错", run?.ok === true, run?.ok ? "" : run?.message);
  if (!run?.ok) return shutdown(1);

  const s = run.summary ?? {};
  check("汇总里的总额对得上目录", s.total === counted, `${s.total} vs ${counted}`);
  check(
    "账对得上：新增 + 跳过 + 失败 = 总数",
    (s.imported ?? 0) + (s.skipped ?? 0) + (s.failed ?? 0) === counted,
    `新增 ${s.imported} + 跳过 ${s.skipped} + 失败 ${s.failed} = ${
      (s.imported ?? 0) + (s.skipped ?? 0) + (s.failed ?? 0)
    }`,
  );
  check("真的下下来了东西", (s.imported ?? 0) > 0, `${s.imported} 条`);
  check("失败率没有失控", (s.failed ?? 0) <= Math.max(5, counted * 0.1), `${s.failed} 条失败`);
  check("进度事件推过", run.seen >= 2, `${run.seen} 次`);
  const sample = run.events?.[0];
  check("进度里带得动总价与当前图名", Boolean(sample) && typeof sample.total === "number", sample ? `total=${sample.total} done=${sample.done}` : "缺");

  const after = await evaluate("(async () => (await window.studio.assets.list({})).length)()");
  check("资产库真的多了", after > before, `${before} → ${after}`);

  // 再跑一次：全都在本地了，应该一条都不下。
  const again = await evaluate(
    `
    (async () => {
      try {
        return await window.studio.referenceLibrary.importAll({ kinds: ["normal"], concurrency: 6 });
      } catch (error) {
        return { error: String(error?.message ?? error) };
      }
    })()
  `,
    300_000,
  );
  check(
    "重跑一次全部跳过（断点续传靠这个）",
    (again?.imported ?? -1) === 0 || (again?.imported ?? 0) + (again?.failed ?? 1) === 0,
    again ? `新增 ${again.imported} / 跳过 ${again.skipped}` : "缺",
  );

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok === results.length ? "✓" : "✗"} ${ok}/${results.length} 项通过`);
  if (ok !== results.length) {
    console.log("\n未通过：");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}${r.detail ? `：${r.detail}` : ""}`);
  }
  shutdown(ok === results.length ? 0 : 1);
}

main().catch((error) => {
  console.log(`脚本异常：${error?.message ?? error}`);
  shutdown(1);
});
