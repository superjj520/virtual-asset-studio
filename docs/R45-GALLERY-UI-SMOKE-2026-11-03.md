# R45 图库选图弹窗的逻辑冒烟

`comfyui-vas-nodes/web/gallery.js` 写了 228 行，从 R39 到现在只跑过 `node --check`——那只能证明语法没写错，证明不了「点按钮会发请求、会渲染卡片、会写回下拉」。这轮补上。

## 为什么不用真浏览器

要跑它得有 ComfyUI，而 ComfyUI 依赖 torch。R40 时装上了（Python 3.11 + torch 2.15.0），这次重装失败：

```
ProxyError('Cannot connect to proxy.', [Errno 61] Connection refused)
```

系统代理指向 `127.0.0.1:10900`，那个端口现在没人听。`--proxy ""`、清空 `HTTP_PROXY`/`HTTPS_PROXY`、改 `127.0.0.1:7890` 都绕不过去（pip 走 macOS 系统代理配置）。`curl https://pypi.org/simple/torch/` 直连是 200，所以是 pip 侧的问题，不是网络不通。

## 做法：最小 DOM stub 把逻辑跑通

`comfyui-vas-nodes/web/gallery_smoke.mjs`，纯 Node、零依赖：

1. **自己实现元素对象**：`createElement` / `appendChild` / `querySelector(All)` / `addEventListener` / `fire` / `dataset`。`innerHTML` 用正则抠出 `<div|button|span class="x">`，够 panel 那一段用。
2. **注入 fake app**：把源文件里的 `import { app } from "../../scripts/app.js"` 换成 `const app = globalThis.__app`，再用 `new Function` 执行——绕开 ESM 解析，不改生产文件。
3. **注入 fake fetch**：记下每个 URL，返回固定两条姿势数据。
4. **把 `openPicker` 暴露到 globalThis**：`function openPicker(` 替换成 `globalThis.__openPicker = function openPicker(`。

## 13 项断言

```
✓ 注册了前端扩展
✓ 扩展有 beforeRegisterNodeDef
✓ 六个图库节点都挂了「浏览图库」按钮 — 6/6
✓ 弹窗挂到了 body 上
✓ 请求打到了 catalogue 接口 — /vas_gallery/catalogue?site=pose&q=&offset=0&limit=36
✓ 请求带上 site=pose
✓ 请求带分页上限 36
✓ 渲染出卡片 — 2 张
✓ 卡片缩略图走代理地址
✓ 状态行有数字 — 已显示 2 / 匹配 2（库内 1439）
✓ 点图后写回了「选择」下拉 — P001 · S形站姿 · 正面
✓ 弹窗已关闭
✓ 搜索把 q 带进请求
```

跑法：`node comfyui-vas-nodes/web/gallery_smoke.mjs`（退出码 0 = 全过，1 = 有失败）。

## 这证明了什么、没证明什么

**证明了**：扩展注册成功、六个节点都能挂上按钮、点开后确实按 `site/q/offset/limit` 发请求、返回的数据会被渲染成带代理缩略图的卡片、状态行文案对、点一张图会把 label 写回「选择」下拉并关窗、改搜索词会把 `q` 带进下一次请求。

**没证明**：
- 真实 LiteGraph 里 `addWidget("button", ...)` 长什么样、按钮点不点得到（stub 里的节点是我自己造的）
- 真实 `fetch` 打到 `routes.py` 能不能通（那是 R40 单独验证的，六个源的条数在真 ComfyUI 里对过）
- CSS 在 ComfyUI 页面里的实际呈现（弹窗是原生 DOM，没跟 ComfyUI 主题走深浅色，这是已知的）
- `app.graph.setDirtyCanvas` 的真实效果

**一次 stub 与实现的偏差**：第一版我把注入写成 `const { app } = globalThis.__app`，而 `__app` 本身是 `{ registerExtension }`，解构出来是 `undefined`，报 `Cannot read properties of undefined (reading 'registerExtension')`。改成 `const app = globalThis.__app` 才对——这种错在真浏览器里同样会犯，早发现比晚发现好。
