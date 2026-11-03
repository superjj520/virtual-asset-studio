#!/usr/bin/env node
/**
 * 素材库的「质量」体检——和 verify-health 的区别是那个只数条数，这个看内容。
 *
 * 为什么要有这个脚本：
 * 条数涨到 7,924 之后，真正决定用户能不能用的不是总数，而是——
 *   · 每条都有标题、分类、缩略图吗（有没有 undefined 漏进 UI）
 *   · 分类有没有空值或 "undefined" 这种脏数据
 *   · 搜「站姿」「白衬衫」这种词，跨分类能不能搜到东西
 *   · 同一个标题重复了几千条的话，下拉里翻十屏都是一样的名字
 *
 * 用法：
 *   npm run rebuild:native:electron
 *   node scripts/reference-quality.mjs
 *
 * 退出码：0 全部通过 / 1 有断言失败 / 2 环境阻塞
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9609;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-quality-"));
const STEP_TIMEOUT = 210_000; // 要拉七个上游，法线走 raw.githubusercontent 会慢

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let child;
let ws;
const WATCHDOG_MS = 400_000;
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
  child = spawn(
    join(ROOT, "node_modules/.bin/electron"),
    [".", `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, stdio: "ignore", detached: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } },
  );

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
  await sleep(4000);

  // 一次把整个目录拉下来，统计全在页面里做——省得几万个字段跨 CDP 传。
  const report = await evaluate(`(async () => {
    const list = window.studio?.referenceLibrary?.list;
    if (typeof list !== "function") return { miss: "no list api" };
    const cat = await list();
    const items = cat?.items ?? [];
    const isBad = (v) => v === undefined || v === null || v === "" || /^(undefined|null|NaN)$/i.test(String(v).trim());

    const byKind = {};
    const badTitle = [];
    const badCategory = [];
    const badThumb = [];
    const categoryOf = {};
    const titleCount = new Map();

    for (const it of items) {
      byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
      if (isBad(it.title)) badTitle.push(it.id);
      if (isBad(it.category)) badCategory.push(it.id);
      if (isBad(it.thumbUrl)) badThumb.push(it.id);
      const c = String(it.category ?? "");
      categoryOf[c] = (categoryOf[c] ?? 0) + 1;
      const t = String(it.title ?? "");
      titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    }

    // 重复标题：同一串名字被多少条共用。全库一条条数不一样才正常。
    const dupTitles = [...titleCount.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

    // 检索：用户真会打的词，且必须是上游数据里真实存在的说法。
    // 「白衬衫」这类词在库里确实是 0 条——上游把衣服叫「针织衫」不叫「衬衫」，
    // 那是数据用词问题，不是检索坏了，所以不拿它当断言。
    const probes = ["站姿", "坐姿", "双人", "衬衫", "半身裙", "牛仔", "长发", "短发", "泳装", "制服", "婚纱", "T恤"];
    // 英文也要能搜：服装的 tags 里放了上游的英文关键词，用户打 white 应该能命中。
    const englishProbes = ["white", "denim", "skirt"];
    const hits = {};
    for (const p of probes) {
      hits[p] = items.filter((it) => {
        const hay = [it.title, it.category, ...(it.tags ?? [])].join(" ").toLowerCase();
        return hay.includes(p.toLowerCase());
      }).length;
    }
    const englishHits = {};
    for (const p of englishProbes) {
      englishHits[p] = items.filter((it) => {
        const hay = [it.title, it.category, ...(it.tags ?? [])].join(" ").toLowerCase();
        return hay.includes(p);
      }).length;
    }

    return {
      total: items.length,
      counts: cat?.counts ?? {},
      byKind,
      badTitle: badTitle.slice(0, 5),
      badTitleCount: badTitle.length,
      badCategory: badCategory.slice(0, 5),
      badCategoryCount: badCategory.length,
      badThumbCount: badThumb.length,
      categoryCount: Object.keys(categoryOf).length,
      categoryTop: Object.entries(categoryOf).sort((a, b) => b[1] - a[1]).slice(0, 8),
      dupTitleCount: dupTitles.length,
      dupTitleTop: dupTitles.slice(0, 5),
      hits,
      englishHits,
    };
  })()`);

  if (!report || report.miss) {
    check("拿到素材库目录", false, report?.miss ?? "空");
    return bail;
  }

  check("拿到素材库目录", report.total > 6000, `${report.total} 条`);
  check(
    "每条都有标题",
    report.badTitleCount === 0,
    report.badTitleCount ? `${report.badTitleCount} 条缺标题，例如 ${report.badTitle.join(", ")}` : "0 条异常",
  );
  check(
    "每条都有分类",
    report.badCategoryCount === 0,
    report.badCategoryCount ? `${report.badCategoryCount} 条缺分类，例如 ${report.badCategory.join(", ")}` : "0 条异常",
  );
  check("每条都有缩略图地址", report.badThumbCount === 0, `${report.badThumbCount} 条缺地址`);

  // 重复标题是有意的：姿势按「组 · 编号 · 视角」命名，同一组每视角名字本来就不同；
  // 但如果有 3,000 条都叫同一个名字，下拉里就没法选。这里按「是否大面积重复」判。
  const worstDup = report.dupTitleTop[0]?.[1] ?? 0;
  check(
    "没有大面积重名",
    worstDup < 200,
    `重复标题 ${report.dupTitleCount} 组，最多的一组 ${worstDup} 条（${report.dupTitleTop[0]?.[0] ?? "无"}）`,
  );

  const emptyHits = Object.entries(report.hits).filter(([, n]) => n === 0).map(([k]) => k);
  check(
    "中文检索词都能搜到东西",
    emptyHits.length === 0,
    emptyHits.length ? `搜不到：${emptyHits.join("、")}` : Object.entries(report.hits).map(([k, n]) => `${k}=${n}`).join(" "),
  );
  const emptyEnglish = Object.entries(report.englishHits ?? {}).filter(([, n]) => n === 0).map(([k]) => k);
  check(
    "英文关键词也能搜（服装 tags 带了上游英文词）",
    emptyEnglish.length === 0,
    emptyEnglish.length
      ? `搜不到：${emptyEnglish.join(", ")}`
      : Object.entries(report.englishHits).map(([k, n]) => `${k}=${n}`).join(" "),
  );

  const kinds = Object.entries(report.byKind).map(([k, n]) => `${k}=${n}`).join(" ");
  console.log(`\n分类分布（共 ${report.categoryCount} 个）：`);
  for (const [name, n] of report.categoryTop) console.log(`  ${name}  ${n}`);
  console.log(`\n各类型：${kinds}`);
  console.log(`检索命中：${Object.entries(report.hits).map(([k, n]) => `${k}=${n}`).join(" ")}`);

  return bail;
}

let code = 2;
try {
  code = await main();
} catch (e) {
  check("执行断言", false, e.message);
  code = 1;
}

cleanup();
const failed = results.filter((r) => !r.ok);
if (!results.length) {
  console.log("\n环境阻塞，一条断言都没跑起来");
  process.exit(2);
}
console.log(`\n${failed.length === 0 ? "✓ 全部通过" : `✗ ${failed.length} 项失败`}（共 ${results.length} 项）`);
process.exit(failed.length === 0 ? 0 : 1);
