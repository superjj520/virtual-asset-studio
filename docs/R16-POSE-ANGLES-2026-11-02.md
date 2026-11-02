# R16 姿势多角度引用验收（2026-11-02）

## 背景

对照 `https://ai-pose-gallery.anhao.app/poses` 做逐项差距核算后发现：对方姿势库 1,439 条记录按「体系 + 姿势编号」聚合后是 288 组、每组 5 个视角（正面 / 斜侧 / 侧面 / 仰视 / 俯视）。

我们早已把这个数据源整体接入（`electron/services/reference-library.ts:16` 的 `BASE_URL`），但在 `groupPoses` 里只保留一张正面图：

```ts
const preferred = variants.find((row) => row.角度 === "正面") ?? variants[0];
```

结果是 1,439 条数据里 1,151 张（80%）虽然下载在内存里，用户在主界面永远看不到，也没法选。这是本轮修的第一项：**让已有数据全部可用，不引入任何新依赖**。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/shared/reference-library.ts` | 新增 `CloudReferenceVariant`（`id` / `label` / `thumbUrl` / `imageUrl`），`CloudReferenceItem` 增加可选 `variants`；仅当姿势存在一个以上视角时提供，首项与物品默认图一致 |
| `electron/services/reference-library.ts` | 新增 `POSE_ANGLE_ORDER`（正面 / 斜侧 / 斜前 / 侧面 / 仰视 / 俯视 / 背面）与 `angleRank`；`groupPoses` 按序排序后取首项作默认图，并挂载 `variants`（视角 id 为 `pose-${key}-${角度}`） |
| `src/reference/ReferenceSheetComposer.tsx` | `chooseCloud(item, variant?)` 支持引用指定视角；云卡片从单个 `<button>` 拆成容器 + 内层按钮，下方渲染 `role="group"` 视角条，每个视角按钮带 `aria-pressed` |
| `src/styles.css` | 新增 `.reference-sheet-asset-pick` 与 `.reference-sheet-angles`（22px 高；900px 以下横滑且触控目标 44px） |

## 测试

- `electron/services/reference-library.test.ts` 新增 2 例：五个角度按 正面 / 斜侧 / 侧面 / 仰视 / 俯视 排序、首项与物品默认图一致、id 唯一；单视角姿势不产生 `variants`。
- 新建 `src/reference/ReferenceSheetComposer.angles.test.tsx` 3 例：视角条完整渲染且默认未选中；点「侧面」引用侧面原图与标题；点卡片主体引用正面原图。

## 真实窗口验收

用 CDP 驱动真实 Electron 窗口（`electron .` + `--remote-debugging-port`），在参考卡工坊 → 云端图库 → 姿势分类下实测：

```
分类按钮： 全部 4221 | 人像 1499 | 服装 1847 | 发型 306 | 姿势 569
角度条数量： 48（首屏 48 张卡片全部带视角条）
视角按钮样例： ['正面','斜侧','侧面','仰视','俯视','正面','斜侧']
点击「侧面」后槽位：S形站姿・胯部侧顶 · 编号 P001 · 5 视角 · 侧面
aria-pressed=true 的按钮：['侧面']（唯一）
```

姿势分类 569 = anhao 聚合后 288 组 + char-db-cn 281 条，说明分组与新增视角同时生效。

证据截图：

- `artifacts/screenshots/pose-angles.png`：48 张卡片均带视角条
- `artifacts/screenshots/pose-angles-selected.png`：选中「侧面」后槽位、预览板与高亮同步

## 已知限制

1. 视角条位于卡片底部，面板高度 820px 时首屏需在右侧区域滚动约 200px 才能看到完整视角行；滚动后完整可见。缩小预览板可以缓解，但会牺牲合成结果的审阅尺寸，本轮不改。
2. 只有存在多视角的姿势才显示视角条；人像、服装、发型维持原样。
3. 单个视角的姿势仍走原路径，不增加任何 DOM 节点。

## 质量门禁

- `npx tsc --noEmit` 通过。
- `npm test`：86 个文件、409 项测试全部通过。
- `npm run build` 通过。

## 状态

代码与自动化测试：已验收。真实窗口截图：已取得（见上）。移动端 44px 触控规则已写入 CSS，未在真机窗口复验。
