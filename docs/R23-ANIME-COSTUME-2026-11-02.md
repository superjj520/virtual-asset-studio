# R23 · 接入动漫衣装库 COSTUME-ANIME-DB（2026-11-02）

## 新增的源

`https://ai-costume-anime-gallery.pages.dev/` —— 衣装集 アニメ版，**1,320 条**动漫服装。

分类：春 197 / 夏 237 / 秋 230 / 冬 232 / ランジェリー（内衣）197 / セクシー（性感）139 / 水着（泳装）52 / パーティ（派对）36。

它补的是「二次元服装」这个缺口：原来的服装库来自 anhao（真人/写实向 1,407 条）和 char-db-cn（换装 440 条），没有一条是动漫立绘风格的服装。

## 数据怎么拿

跟 R17 的深度图库完全同构——又是 pages.dev 静态站，数据内联在首页 `<script>` 里：

```js
const META={"total": 1320, "cats": [...], "counts": {...}};
const D=[{"id":"SPR-0001","カテゴリ":"春","キーワード":"ivory frill knit denim mini skirt coat socks white sneakers","サムネ":"thumbs/SPR-0001.webp","画像":"img/SPR-0001.webp","原寸":"png/SPR-0001.png"}, ...]
```

`/data/xxx.json` 这类路径一律返回 SPA fallback 的 HTML，不要再试。

三档图都实测 200：`thumbs/*.webp`（13KB 缩略图）、`img/*.webp`（41KB 中图）、`png/*.png`（原寸）。选 `サムネ` 做缩略、`画像` 做引用图。

## 代码改动

**`src/shared/reference-library.ts`**
- `CLOUD_REFERENCE_KINDS` 加 `"anime-costume"`，标签「动漫衣装」
- 新增 `ANIME_COSTUME_REFERENCE_SOURCE`

**`electron/services/reference-library.ts`**
- 常量 `ANIME_BASE` / `ANIME_SOURCE`、类型 `AnimeCostumeRow`
- **抽取 `parseInlineArray<T>(html, marker)`**：原来 `fetchDepthPoses` 里的括号配对扫描逻辑抽成模块级函数，深度图库和动漫衣装库共用。R17 那次是内联写死的，现在两个源同一套，以后再加同类站只写三行。
- `fetchAnimeCostumes()`：失败返回 `[]`，不影响其余五个源
- 条目映射：`id` = `anime-costume-SPR-0001`，`title` = `「春 · SPR-0001」`，`category` 用日文分类，**`キーワード` 按空格拆成 tags**——这样搜索框能命中 `denim`、`knit` 这类英文词
- `counts` / `imageCounts` / `totalImages` / `sourceName` / `attribution` 全部并进新源
- `CLOUD_ORIGINS` 加 `new URL(ANIME_BASE).origin` （R17 踩过的坑，这次没忘）

## 测试

`electron/services/reference-library.test.ts` 加 1 项「解析动漫衣装库的内联数据并作为独立分类」：断言条数为 1、缩略图/引用图 URL 正确、`sourceName` 是 `COSTUME-ANIME-DB`、`category` 是「春」、**tags 里能查到 `denim`**（验证关键词拆分真的进搜索）。

门禁：90 文件 / **441 测试全过**，build 通过。

## 真机验证

CDP 截图 `artifacts/screenshots/anime-costume.png`：

```
全部 6980 | 人像 1499 | 服装 1847 | 发型 306 | 姿势 569 | 深度 1439 | 动漫衣装 1320
共 8131 张 / 6980 条记录
```

48 张卡片全部加载，标题形如「春 · SPR-0001」，副标题「动漫衣装 · 春」，底部归属声明已带 `COSTUME-ANIME-DB`。

## 规模变化

| | 之前 | 现在 |
|---|---|---|
| 条数 | 5,660 | **6,980** |
| 唯一素材 | 6,811 | **8,131** |
| 对标 anhao | 5,784 | 5,784 |

领先幅度从 1,027 张拉到 **2,347 张**（+41%）。
