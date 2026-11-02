# R44 用 char-db 的中文分类，替掉动漫衣装站的日文

用户给了 `https://github.com/sleepy-zone/char-db-cn`，说「中文版本给你补充一下」。挖下去发现它真正能补的不是条目，是**分类名**。

## 为什么

动漫衣装站（`ai-costume-anime-gallery.pages.dev`）的条目分类是日文：`春 / 夏 / 秋 / 冬 / ランジェリー / パーティ / 水着 / セクシー`。前四个恰好中文同形，看不出问题；后四个在界面上就是「动漫衣装 · ランジェリー」这种中日混排。

char-db-cn 的 `outfit2` 分支是**同一批 1,320 条**（id 完全重合），`catZh` 是中文分类，数量一一对应：

| 日文（动漫衣装站） | 中文（char-db catZh） | 条数 |
|---|---|---|
| 春 | 春 | 197 |
| 夏 | 夏 | 237 |
| 秋 | 秋 | 230 |
| 冬 | 冬 | 232 |
| ランジェリー | 内衣 | 197 |
| パーティ | 派对 | 36 |
| 水着 | 泳装 | 52 |
| セクシー | 性感 | 139 |

## 怎么改的

`electron/services/reference-library.ts` 里，在用 char-db 数据的同时建一张翻译表：

```ts
const animeCategoryZh = new Map(
  charDb.filter((row) => row.set === "outfit2").map((row) => [row.id, row.catZh ?? ""]),
);
```

动漫衣装条目改成先查表、查不到再退回日文：

```ts
const category = animeCategoryZh.get(row.id) || row.カテゴリ || "动漫衣装";
```

`title` 与 `tags` 一起用中文分类，搜索「内衣」也能命中——原来只有日文分类标签，搜中文搜不到。

## 注意：outfit2 仍然不进素材库

R31 就判断过 `outfit2` 与动漫衣装站是同一批图（1,320 张），**不能当独立条目收录**，否则卡片池里会出现两遍、`counts` 数字也会虚高。这轮只借它的分类名，条目依然靠 `charDbOnly` 白名单挡掉。

## 没补上的

- **深度库 1,439 条标题仍是日文**（`S字立ち・腰を横に突き出す`）。char-db 里没有这批数据，也没有可对齐的中文源。要么等上游出中文版，要么自己翻 1,439 条——后者要人工校对，机器翻会把姿势术语翻错。
- **outfit2 没有中文条目名**。char-db 里 `zh` 字段就是 id（`SPR-0001`），所以卡片标题只能是「内衣 · SPR-0001」，不是「蕾丝吊带裙」。它有英文 `tags`（`ivory, frill, knit, denim, mini, skirt...`），但直接拿来当标题是词表不是名字。

## 门禁

- `npx tsc --noEmit` 无输出
- `npm test` **95 文件 / 504 测试全过**（新增 1 项：日文「ランジェリー」→ 中文「内衣」，标题与标签同步）
