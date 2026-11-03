/**
 * 虚拟资产 · 图库选图器（ComfyUI 前端扩展）
 *
 * 为什么要有这个：节点原本只有一个「选择」下拉，里面塞着 1,439 条
 * 「P001 · S形站姿・胯部侧顶 · 正面」。用户得靠下拉列表翻，看不到图。
 *
 * 这里给七个图库节点挂一个「浏览图库」按钮，点开是一个带缩略图的弹窗：
 * 搜索框 + 来源切换 + 分页网格。点一张图就把它的名字写回「选择」下拉。
 *
 * 数据来自同包的 routes.py（`/vas_gallery/sites|catalogue|thumb`），
 * 缩略图必须走那个代理——浏览器的 <img> 直接指远程域名会被跨域挡掉。
 */

import { app } from "../../scripts/app.js";

const SITES = [
  { key: "pose", label: "姿势" },
  { key: "depth", label: "深度图" },
  { key: "clay", label: "黏土" },
  { key: "normal", label: "法线" },
  { key: "photo", label: "实拍" },
  { key: "costume", label: "服装" },
  { key: "portrait", label: "人像" },
  { key: "anime", label: "动漫衣装" },
  { key: "chardb", label: "二次元换装" },
];

const PAGE_SIZE = 36;

// 节点 widget 名 → 默认打开哪个来源
const NODE_SITE = {
  VASPoseGallery: "pose",
  VASDepthGallery: "depth",
  VASClayGallery: "clay",
  VASNormalGallery: "normal",
  VASPhotoGallery: "photo",
  VASCostumeGallery: "costume",
  VASPortraitGallery: "portrait",
  VASAnimeCostumeGallery: "anime",
  VASCharacterPack: "chardb",
};

const STYLE_ID = "vas-gallery-style";
const CSS = `
.vas-overlay{position:fixed;inset:0;background:rgba(8,9,12,.72);display:flex;align-items:center;justify-content:center;z-index:12000;}
.vas-panel{width:min(1080px,92vw);height:min(760px,88vh);background:#17181c;border:1px solid #2b2d33;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;color:#e6e7ea;font:13px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;}
.vas-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #26282e;}
.vas-title{font-size:15px;font-weight:600;margin-right:auto;}
.vas-close{background:none;border:none;color:#9aa0a8;font-size:20px;cursor:pointer;padding:2px 8px;border-radius:6px;}
.vas-close:hover{background:#26282e;color:#e6e7ea;}
.vas-bar{display:flex;gap:8px;padding:10px 16px;flex-wrap:wrap;border-bottom:1px solid #26282e;}
.vas-chip{background:#22242a;border:1px solid #2f3138;color:#b9bec7;border-radius:999px;padding:4px 11px;cursor:pointer;font-size:12px;}
.vas-chip[data-on="1"]{background:#3b5bdb;border-color:#4c6ef5;color:#fff;}
.vas-search{margin-left:auto;background:#101115;border:1px solid #2f3138;color:#e6e7ea;border-radius:8px;padding:5px 10px;min-width:200px;font-size:12px;}
.vas-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;padding:14px 16px;}
.vas-card{background:#1d1f24;border:1px solid #2b2d33;border-radius:10px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;}
.vas-card:hover{border-color:#4c6ef5;}
.vas-card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:#101115;display:block;}
.vas-card span{padding:6px 8px;font-size:11px;color:#b9bec7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vas-foot{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid #26282e;font-size:12px;color:#9aa0a8;}
.vas-more{background:#22242a;border:1px solid #2f3138;color:#e6e7ea;border-radius:8px;padding:6px 14px;cursor:pointer;margin-left:auto;}
.vas-more:disabled{opacity:.45;cursor:default;}
.vas-empty{grid-column:1/-1;color:#7c828c;text-align:center;padding:40px 0;}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function widgetByName(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}

function applyChoice(node, label) {
  const widget = widgetByName(node, "选择");
  if (!widget) return;
  widget.value = label;
  // ComfyUI 的下拉来自选填列表，有些版本要把它同步进 options.values
  if (widget.options && Array.isArray(widget.options.values) && !widget.options.values.includes(label)) {
    widget.options.values.push(label);
  }
  widget.callback?.(label);
  app.graph?.setDirtyCanvas?.(true, true);
}

async function jsonFetch(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function openPicker(node, initialSite) {
  ensureStyle();

  const overlay = document.createElement("div");
  overlay.className = "vas-overlay";

  const panel = document.createElement("div");
  panel.className = "vas-panel";
  panel.innerHTML = `
    <div class="vas-head">
      <div class="vas-title">挑一张图</div>
      <button class="vas-close" title="关闭">×</button>
    </div>
    <div class="vas-bar"></div>
    <div class="vas-grid"></div>
    <div class="vas-foot">
      <span class="vas-status">正在读取…</span>
      <button class="vas-more">再看 36 张</button>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const bar = panel.querySelector(".vas-bar");
  const grid = panel.querySelector(".vas-grid");
  const status = panel.querySelector(".vas-status");
  const more = panel.querySelector(".vas-more");

  let site = initialSite;
  let query = "";
  let offset = 0;
  let matched = 0;

  SITES.forEach(({ key, label }) => {
    const chip = document.createElement("button");
    chip.className = "vas-chip";
    chip.textContent = label;
    chip.dataset.site = key;
    chip.addEventListener("click", () => {
      site = key;
      offset = 0;
      grid.innerHTML = "";
      syncChips();
      load();
    });
    bar.appendChild(chip);
  });

  const search = document.createElement("input");
  search.className = "vas-search";
  search.placeholder = "搜名称、分类或角度";
  search.addEventListener("input", () => {
    query = search.value.trim();
    offset = 0;
    grid.innerHTML = "";
    load();
  });
  bar.appendChild(search);

  function syncChips() {
    bar.querySelectorAll(".vas-chip").forEach((chip) => {
      chip.dataset.on = chip.dataset.site === site ? "1" : "0";
    });
  }

  function close() {
    overlay.remove();
  }

  panel.querySelector(".vas-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  more.addEventListener("click", () => {
    offset += PAGE_SIZE;
    load();
  });

  async function load() {
    more.disabled = true;
    status.textContent = "正在读取…";
    try {
      const params = new URLSearchParams({ site, q: query, offset: String(offset), limit: String(PAGE_SIZE) });
      const payload = await jsonFetch(`/vas_gallery/catalogue?${params}`);
      matched = payload.matched;
      payload.items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "vas-card";
        card.title = item.label;
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = item.thumb;
        img.alt = item.label;
        const caption = document.createElement("span");
        caption.textContent = item.label;
        card.append(img, caption);
        card.addEventListener("click", () => {
          applyChoice(node, item.label);
          close();
        });
        grid.appendChild(card);
      });
      if (!payload.items.length && offset === 0) {
        const empty = document.createElement("div");
        empty.className = "vas-empty";
        empty.textContent = query ? "这个来源里没有匹配的图" : "这个来源暂时没有数据";
        grid.appendChild(empty);
      }
      const shown = Math.min(offset + payload.items.length, matched);
      status.textContent = `已显示 ${shown} / 匹配 ${matched}（库内 ${payload.total}）`;
      more.disabled = offset + payload.items.length >= matched;
    } catch (error) {
      status.textContent = `读取失败：${error.message}`;
    }
  }

  syncChips();
  load();
  return overlay;
}

app.registerExtension({
  name: "VirtualAssetStudio.Gallery",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    const site = NODE_SITE[nodeData?.name];
    if (!site) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      const self = this;
      this.addWidget("button", "浏览图库", null, () => {
        openPicker(self, site);
      });
      return result;
    };
  },
});
