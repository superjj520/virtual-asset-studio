# R43 把深度图真正接到出图链路

R42 把深度图从参考板拼图里拆了出来，但只拆了一半：拆完以后它**谁也不送**。这轮把最后一段接上。

## 之前断在哪

```
参考卡合成 → recipe.depth（有了）
                ↓
        ??? 没有字段承载
                ↓
refineWithResult(...)   ← 入参里从来没有 depthPath
                ↓
comfyui.refineImage({ depthPath })  ← 早就支持，一直没人给它传值
```

中间那段是空的：`CreativeCard` 里没有地方记「这张卡的深度图是哪张资产」，所以出图时无从查起。

## 这轮接了哪些

**1. 卡上记下来。** `CreativeCard` 加 `depthAssetId?: string`；`applyReferenceSheetToCard` 从 `recipe.depth.assetId` 写进去——只有真附了深度图才写字段，没附就不写，避免出图时去查一个空 id。

**2. 请求带上它。** `window.studio.generation.image(...)` 与 `generateImage` IPC 入参加 `depthAssetId`；`src/App.tsx` 在 `normalizedCard.depthAssetId` 存在时传。

**3. 换成文件路径。** `electron/runtime.ts` 的生成处理器里：

```ts
const depthReference = input.depthAssetId
  ? referenceForGeneration(input.depthAssetId, input.projectId)
  : undefined;
```

**4. 只送给需要它的 provider。** `refineWithResult` 的入参加 `depthPath` / `depthMediaType`，调用点按需展开：

```ts
...(depthReference
  ? { depthPath: depthReference.managedPath, depthMediaType: depthReference.mediaType }
  : {}),
```

`comfyui-image-provider` 的 `refineImage` 会先 `uploadImage` 再把它填进 `{{depth_image}}`，工作流里没有这个占位符时**直接报错不发 /prompt**（R31 立的规矩）。其他 provider 收到 `depthPath` 会忽略——它们没有对应入参。

## 门禁

- `npx tsc --noEmit` 无输出
- `npm test` **95 文件 / 503 测试全过**（新增 2 项：写进卡、没深度图时不写）
- build / package:mac / smoke:packaged 全过

## 没做的和为什么

**批量路径没接。** `GenerationBatch` 要在 SQLite 表里加一列，涉及 schema 迁移和旧数据兼容；而批量走的是多候选/系列，深度图主要用在单张精调。硬塞进来会把一次行为改动变成一次数据迁移，按「一次只解决一个可观察的问题」留到单独一轮。

**没做端到端真机验证。** 要证明「选一张深度图 → 出图时 ComfyUI 收到它」，需要同时具备：运行中的 ComfyUI + 一个含 `{{depth_image}}` 的工作流 + 一个真实 checkpoint。前两个 `docs/R40-REAL-COMFYUI-VERIFY-2026-11-03.md` 里验证过搭建方法，checkpoint 本机没有。所以现在的证据链是：`recipe.depth` 有值（单测）→ `card.depthAssetId` 有值（单测）→ IPC 带 `depthAssetId`（类型）→ `depthPath` 传进 provider（类型）→ provider 收到 `depthPath` 会上传并注入（R31 的 12 项测试）。**中间没有断点，但也没跑过一条完整真链路。**
