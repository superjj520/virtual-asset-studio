import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const app = process.env.SMOKE_APP ?? "release/虚拟资产创作工作台-darwin-arm64/虚拟资产创作工作台.app/Contents/MacOS/虚拟资产创作工作台";
const port = 9338;
const userData = mkdtempSync(join(tmpdir(), "vas-smoke-"));
const child = spawn(app, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
      const page = pages.find((item) => item.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("打包 App 没有在 30 秒内暴露调试页面");
}
let ws;
let seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
try {
  ws = new WebSocket(await target());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => { const msg = JSON.parse(event.data); const item = pending.get(msg.id); if (item) { pending.delete(msg.id); msg.error ? item.reject(new Error(msg.error.message)) : item.resolve(msg.result); } };
  await send("Runtime.enable");
  let cards = 0;
  for (let i = 0; i < 20; i++) {
    cards = await evaluate(`document.querySelectorAll(".creation-launch-card").length`);
    if (cards === 4) break;
    await sleep(500);
  }
  if (cards !== 4) throw new Error(`创作中心入口卡数量应为 4，实际 ${cards}；页面：${await evaluate("location.href")}`);
  const clicked = await evaluate(`(() => { const b=[...document.querySelectorAll(".creation-launch-card")].find(x=>x.getAttribute("aria-label")==="单张画面"); b?.click(); return !!b; })()`);
  if (!clicked) throw new Error("没有找到单张画面入口");
  let text = "";
  for (let i = 0; i < 20; i++) {
    text = await evaluate(`document.body.innerText.slice(0, 1200)`);
    if (text.includes("选主体和画面") || text.includes("单张画面")) break;
    await sleep(400);
  }
  if (!text.includes("选主体和画面") && !text.includes("单张画面")) throw new Error(`进入单张创作后没有识别到标题：${text.slice(0, 120)}`);
  console.log("打包 App 冒烟通过：4 个入口，可进入单张创作");
} finally {
  try { ws?.close(); } catch {}
  child.kill("SIGTERM");
  await sleep(800);
  rmSync(userData, { recursive: true, force: true });
}
