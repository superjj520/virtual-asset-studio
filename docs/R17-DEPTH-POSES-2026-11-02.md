# R17 姿势深度图接入验收（2026-11-02）

## 背景

与 anhao 逐项核算后，唯一数量缺口是**姿势深度图 1,439 张**（对方 README：4,345 条记录 / 11,568 张文件，其中深度图独占 2,878 张）。

之前的判断是错的：以为 `https://ai-pose-depth-gallery.pages.dev/data/pose-zh.json` 返回 200 就是 JSON 端点。实际打开是 `depth ポーズ集 POSE-DB-02` 的单页 HTML（450 KB），`/data/*.json` 全部落到 SPA fallback，返回的是 index.html。数据根本没有独立端点。

## 真实数据形态

全部 1,439 条内联在首页的 `<script>` 里：

```js
const META={"lines": ["全身1人・セクシー系", "全身1人・標準系", "上半身1人", "2人絡み"]};
const D=[{"id":"full_sexy_P001_front","系統":"…","ポーズ番号":"P001","分類":"立ち",
        "ポーズ名":"S字立ち・腰を横に突き出す","アングル":"正面",
        "サムネ":"thumbs/full_sexy_P001_front.jpg","原寸":"img/full_sexy_P001_front.png"}, …];
```

系统分布与 anhao 姿势库完全对应（399 / 365 / 400 / 275），说明是同一套 288 组 × 5 视角的深度版本。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/shared/reference-library.ts` | `CLOUD_REFERENCE_KINDS` 增加 `depth`，标签「深度」；新增 `DEPTH_REFERENCE_SOURCE` |
| `electron/services/reference-library.ts` | 新增 `DEPTH_BASE` / `DepthRow` / `depthUrl()`；`fetchDepthPoses()` 从 HTML 里按括号配对提取 `const D=[…]`（跳过字符串内括号）；`load()` 并入 catalog，补 `counts.depth`、`imageCounts.depth`、`totalImages`；`CLOUD_ORIGINS` 登记深度站 origin |

两个设计决定：

1. **解析失败退化为空列表**，不抛错。深度站属于增量来源，它挂了不该拖垮人像 / 服装 / 姿势 / 二次元四个主来源。
2. **origin 必须进白名单**。`assertCloudUrl` 只放行已登记来源，第一版忘了加，结果所有缩略图卡在「加载中」——真机截图才暴露，单测发现不了。

## 测试

`electron/services/reference-library.test.ts` 新增 2 例：

- 「解析深度姿势集的内联数据并作为独立分类」：断言 `counts.depth`、id 前缀 `depth-`、thumb/原寸 URL 拼接、`sourceName` 为 `POSE-DB Depth`、`category` 为 `立ち`。
- 「深度姿势集读取失败时不影响其余素材」：深度站返回 503 时 `counts.depth = 0` 且 `counts.pose` 仍为 1。

## 真实窗口验收

```
分类按钮： 全部 5660 | 人像 1499 | 服装 1847 | 发型 306 | 姿势 569 | 深度 1439
网格卡片： 48
缩略图加载： 48 / 48（naturalWidth 300）
首条标题： S字立ち・腰を横に突き出す · 正面
```

证据截图：`artifacts/screenshots/pose-depth.png`

## 素材库规模对比（更新）

| 项 | anhao | 本工作台（改后） |
| --- | --- | --- |
| 条目 | 4,345 | 5,660 |
| 唯一素材 | 5,784 | **6,811** |
| 缩略图+原图文件 | 11,568 | 13,622 |

深度图接入后，唯一素材口径已反超 1,027 张（多出来的是 char-db-cn 的 1,027 条二次元素材）。

## 已知限制

1. 深度图属于 ControlNet Depth 输入，当前生成链路还没有 ControlNet 通道，所以它暂时只能作为「参考图」被引用和归档，不能直接驱动姿态约束。这一层要等 ComfyUI 桥接。
2. 标题沿用日文原文（`S字立ち…`），未做中文化。
3. 深度站是单页应用，抓的是首页 HTML，站点改版会破坏解析；解析失败时静默退化为空列表。

## 质量门禁

- `npx tsc --noEmit` 通过。
- `npm test`：86 个文件、411 项测试全部通过。
- `npm run build` 通过。
- 真实 Electron 窗口截图取证通过。
