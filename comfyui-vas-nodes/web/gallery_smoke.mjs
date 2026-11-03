/**
 * gallery.js 的逻辑冒烟测试（纯 Node，零依赖）。
 *
 * 为什么不用真浏览器：要跑它得有 ComfyUI（依赖 torch），而本机 pip 走不通。
 * `node --check` 只能证明语法对，证明不了「点按钮会发请求、会渲染卡片、会写回下拉」。
 * 这里用最小 DOM stub 把这三件事跑一遍。
 *
 * 跑法：node comfyui-vas-nodes/web/gallery_smoke.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------- 最小 DOM ---------- */
let idSeq = 0;
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this._id = ++idSeq;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  remove() {
    const parent = this.parentNode;
    if (parent) parent.children = parent.children.filter((c) => c !== this);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn({ target: this, ...event });
  }
  set innerHTML(html) {
    this._html = html;
    this.children = [];
    // 极简解析：只认 <div class="x"> / <button class="x"> / <span class="x">
    for (const m of html.matchAll(/<(div|button|span)\s+class="([^"]+)"/g)) {
      const child = new El(m[1]);
      child.className = m[2];
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._html ?? ""; }
  _all() {
    const out = [];
    const walk = (node) => {
      for (const c of node.children) { out.push(c); walk(c); }
    };
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    const cls = sel.replace(/^[.#]/, "");
    return this._all().filter((n) => n.className.split(/\s+/).includes(cls));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

const head = new El("head");
const body = new El("body");
const created = [];
globalThis.document = {
  head,
  body,
  _byId: {},
  createElement: (tag) => { const el = new El(tag); created.push(el); return el; },
  getElementById(id) { return this._byId[id] ?? null; },
};

/* ---------- fake ComfyUI app ---------- */
const extensions = [];
globalThis.__app = { registerExtension: (ext) => extensions.push(ext) };

/* ---------- fake fetch ---------- */
const requests = [];
const CATALOGUE = {
  site: "pose", total: 1439, matched: 2, items: [
    { id: "p1", label: "P001 · S形站姿 · 正面", thumb: "/vas_gallery/thumb?site=pose&id=p1", tags: "站姿" },
    { id: "p2", label: "P002 · 双手抱头 · 侧面", thumb: "/vas_gallery/thumb?site=pose&id=p2", tags: "站姿" },
  ],
};
globalThis.fetch = async (url) => {
  requests.push(url);
  return { ok: true, status: 200, json: async () => CATALOGUE };
};

/* ---------- 载入 gallery.js（去掉 ESM import，改用注入的 app） ---------- */
const source = readFileSync(join(here, "gallery.js"), "utf8")
  .replace(/^import\s+\{\s*app\s*\}\s+from\s+["'][^"']+["'];?/m, "const app = globalThis.__app;");
// openPicker / NODE_SITE / SITES 都是模块内的东西，Function 作用域外拿不到，
// 所以执行时把它们挂到 globalThis 上。
const patched =
  source.replace("function openPicker(", "globalThis.__openPicker = function openPicker(")
  + "\nglobalThis.__vasGallery = { NODE_SITE, SITES, PAGE_SIZE };";
new Function(patched)();
const { NODE_SITE, SITES } = globalThis.__vasGallery;

/* ---------- 跑断言 ---------- */
let pass = 0;
const fail = [];
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\ngallery.js 逻辑冒烟\n");

// 1. 扩展注册
const ext = extensions.find((e) => e.name === "VirtualAssetStudio.Gallery");
check("注册了前端扩展", Boolean(ext));
check("扩展有 beforeRegisterNodeDef", typeof ext?.beforeRegisterNodeDef === "function");

// 2. 七个节点都能拿到来源映射（法线是 R29 接进来的第七个源）
const nodeNames = ["VASPoseGallery", "VASDepthGallery", "VASNormalGallery", "VASCostumeGallery", "VASPortraitGallery", "VASAnimeCostumeGallery", "VASCharacterPack"];
const mapped = [];
for (const name of nodeNames) {
  const nodeType = function () {};
  nodeType.prototype = {};
  await ext.beforeRegisterNodeDef(nodeType, { name });
  const fakeNode = { widgets: [], addWidget(kind, label, value, cb) { this.widgets.push({ name: label, value, callback: cb }); } };
  nodeType.prototype.onNodeCreated.call(fakeNode);
  const btn = fakeNode.widgets.find((w) => w.name === "浏览图库");
  mapped.push(Boolean(btn));
}
check("七个图库节点都挂了「浏览图库」按钮", mapped.every(Boolean), `${mapped.filter(Boolean).length}/7`);
check("弹窗的来源列表里有法线", SITES.some((s) => s.key === "normal" && s.label === "法线"), SITES.map((s) => s.key).join(","));
check("法线节点默认打开法线来源", NODE_SITE.VASNormalGallery === "normal", String(NODE_SITE.VASNormalGallery));

// 3. 打开弹窗 → 发请求 → 渲染卡片
const node = {
  widgets: [{ name: "选择", value: "", options: { values: ["", "P001 · S形站姿 · 正面"] }, callback: null }],
};
globalThis.__openPicker(node, "pose");
await new Promise((r) => setTimeout(r, 10));

const overlay = body.querySelector(".vas-overlay");
check("弹窗挂到了 body 上", Boolean(overlay));
check("请求打到了 catalogue 接口", requests.some((u) => u.startsWith("/vas_gallery/catalogue?")), requests[0]);
check("请求带上 site=pose", requests.some((u) => u.includes("site=pose")));
check("请求带分页上限 36", requests.some((u) => u.includes("limit=36")));
const cards = overlay?.querySelectorAll(".vas-card") ?? [];
check("渲染出卡片", cards.length === 2, `${cards.length} 张`);
check("卡片缩略图走代理地址", cards[0]?.children[0]?.src?.startsWith("/vas_gallery/thumb?"));
const statusEl = overlay?.querySelector(".vas-status");
check("状态行有数字", /已显示\s*2\s*\/\s*匹配\s*2/.test(statusEl?.textContent ?? ""), statusEl?.textContent);

// 4. 点卡片 → 写回下拉 → 关闭
cards[0].fire("click");
check("点图后写回了「选择」下拉", node.widgets[0].value === "P001 · S形站姿 · 正面", node.widgets[0].value);
check("弹窗已关闭", !body.querySelector(".vas-overlay"));

// 5. 搜索会带上 q 参数
globalThis.__openPicker(node, "pose");
await new Promise((r) => setTimeout(r, 10));
const overlay2 = body.querySelector(".vas-overlay");
const search = overlay2.querySelector(".vas-search");
search.value = "抱头";
search.fire("input");
await new Promise((r) => setTimeout(r, 10));
check("搜索把 q 带进请求", requests.some((u) => u.includes("q=%E6%8A%B1%E5%A4%B4")) || requests.some((u) => decodeURIComponent(u).includes("q=抱头")));

console.log(`\n${fail.length ? "✗" : "✓"} 通过 ${pass} 项${fail.length ? `，失败 ${fail.length} 项：${fail.join("、")}` : ""}\n`);
process.exit(fail.length ? 1 : 0);
