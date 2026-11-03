#!/usr/bin/env node
/**
 * 云端参考图「点一下真的入库」真机验收。
 *
 * 为什么单独做这一道：`importItem` 的单测里 `fetch` 是假的，返回一段固定
 * 字节，所以它只证明「调用顺序对」，不证明「真能从上游拉下来、写成文件、
 * 进资产库」。素材库再怎么统计条数，最后一步走不通对用户就是零。
 *
 * 断言：挑一张真实条目 → 下载入库 → 托管路径真的存在且是图片 →
 * 资产库查得到 → 元数据记着来源。跑完把临时 user-data 删掉。
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 9339;
const PROFILE = mkdtempSync(join(tmpdir(), "vas-import-"));
const STEP_TIMEOUT = 200_000;
const WATCHDOG_MS = 420_000;

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

  // 拿目录，挑一张法线图——它是七源里图最小的一批（600px webp），
  // 下载快，而且能顺带证明「新加的源也能真入库」。
  const item = await evaluate(`
    (async () => {
      const catalog = await window.studio.referenceLibrary.list();
      const normals = catalog.items.filter((i) => i.kind === "normal");
      const pick = normals[0] ?? catalog.items[0];
      return pick ?? null;
    })()
  `);
  check("目录里挑得到一张图", Boolean(item?.imageUrl), item ? `${item.kind} / ${item.title}` : "空");
  if (!item) return shutdown(1);

  check("挑中的是法线图", item.kind === "normal", item.kind);

  // 真的下载 + 入库。给足时间：上游可能有几秒延迟。
  const imported = await evaluate(
    `
    (async () => {
      const before = (await window.studio.assets.list({})).length;
      const asset = await window.studio.referenceLibrary.import(${JSON.stringify(item)});
      const after = await window.studio.assets.list({});
      const found = after.find((a) => a.id === asset.id);
      return {
        ok: true,
        id: asset.id,
        managedPath: asset.managedPath,
        mediaType: asset.mediaType,
        sha256: asset.sha256,
        cloudReference: asset.metadata?.cloudReference ?? null,
        before,
        after: after.length,
        listed: Boolean(found),
      };
    })().catch((error) => ({ ok: false, message: String(error?.message ?? error) }))
  `,
    240_000,
  );

  check("下载入库没抛错", imported?.ok === true, imported?.ok ? "" : imported?.message);
  if (!imported?.ok) return shutdown(1);

  check(
    "资产库多了一条",
    imported.after === imported.before + 1,
    `${imported.before} → ${imported.after}`,
  );
  check("资产库查得到这条", imported.listed === true);
  check(
    "元数据记着云端来源",
    imported.cloudReference?.itemId === item.id &&
      typeof imported.cloudReference?.sourceName === "string" &&
      imported.cloudReference.sourceName.length > 0,
    imported.cloudReference
      ? `${imported.cloudReference.sourceName ?? "（来源名缺失）"} / ${imported.cloudReference.itemId}`
      : "缺",
  );

  const managed = imported.managedPath ?? "";
  const exists = Boolean(managed) && existsSync(managed);
  check("托管文件真的落在磁盘上", exists, managed || "没有托管路径");

  if (exists) {
    const size = statSync(managed).size;
    check("文件不是空壳", size > 1024, `${size} 字节`);

    const head = readFileSync(managed).subarray(0, 12);
    const isWebp =
      head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP";
    const isPng = head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG";
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    check(
      "文件确实是图片（不是上游的 200+HTML）",
      isWebp || isPng || isJpeg,
      isWebp ? "webp" : isPng ? "png" : isJpeg ? "jpeg" : head.toString("hex"),
    );
  }

  check(
    "类型被记成参考图",
    imported.mediaType?.startsWith("image/") === true,
    imported.mediaType ?? "空",
  );

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.log(`✗ ${failed.length} 项未通过：`);
    for (const item of failed) console.log(`  - ${item.name}${item.detail ? `（${item.detail}）` : ""}`);
    shutdown(1);
  }
  console.log(`全部通过（${results.length} 项）`);
  shutdown(0);
}

main().catch((error) => {
  check("脚本本身没崩", false, String(error?.message ?? error));
  shutdown(1);
});
