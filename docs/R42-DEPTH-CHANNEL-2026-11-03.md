# R42 深度图从参考板里分出去

R41 查出一条链路断点：深度图能看能选，但选进参考板后会被当成普通参考图**拼进那张 1440×960 的拼图**里——模型看到一块灰白线稿，既没有深度约束，还可能把线稿风带进出图。

这轮把深度图从参考板的拼图里拆出来。

## 改了什么

**槽位带来源分类。** `ReferenceSheetSlotInput` 加可选 `kind`（取值就是云端那六类），`normalizeReferenceSheetSlots` 全程保留它。

**深度图不占分区。** 新增 `isDepthSlot(slot)` 与 `splitReferenceSheetSlots(slots) → { board, depth }`。`referenceSheetLayout` 先分离再按剩下的槽位排版——三个槽（含一个深度图）算出来是 `1x2` 两块，不是 `2x2` 三块。

**合成时单独记下来。** `ReferenceSheetRecipe` 加 `depth?: ReferenceSheetSlot`；`composeReferenceSheet` 用 `board` 算版式和拼图，深度图只写进 `recipe.depth`，**不进 `sharp().composite()`**。

**提示词里说明真实行为。** `applyReferenceSheetToCard` 往 `mustKeep` 追加一句：「已附深度图「X」：它约束构图骨架，没有被拼进参考板。只有支持 ControlNet 深度的模型或 ComfyUI 的深度节点才会用到它。」

**界面同步记录。** `ReferenceSheetComposer` 用 `slotKinds` state 记住每个槽位选的素材类别，`choose(asset, kind)` 落状态、`clearRole` 一起清掉；拼图预览过滤掉深度槽，所见即所得。

## 一个真 bug（自己写出来的）

第一版改完，`splitReferenceSheetSlots` 的独立测试全过，但 `referenceSheetLayout` 那条不过——三个槽还是排出三块。

原因是 `normalizeReferenceSheetSlots` 末尾有个 `.map(slot => ({ role, assetId, ... }))` 重建对象，**我加了收集时的 `kind`，却在重建时漏掉了**。函数头尾各拼一次对象，这种地方最容易漏字段。

教训：改「透传字段」不能只改 push 的地方，要把这个函数里所有重建对象的位置都翻一遍。

## 门禁

- `npx tsc --noEmit` 无输出
- `npm test` **95 文件 / 501 测试全过**（新增 5 项深度通道测试）
- `npm run build` 通过
- `npm run package:mac` → `发布校验通过：release 中只有一个当前 App`
- `npm run smoke:packaged` → `4 个入口`

## 诚实边界

- **还没接 ControlNet 出图。** `refineWithResult` 目前仍不传 `depthPath`，所以现在选深度图的效果是「不再污染参考板 + 提示词里说明它没生效」，而不是「按深度出图」。下一步要做的正是这段：从 `recipe.depth.assetId` 查本地路径，传给 `refineImage({ depthPath })`。
- 这个改动会让之前「深度图混在拼图里」的行为消失。它本来就是错的，但确实是个行为变化。
- ComfyUI 节点侧的深度能力一直是完整的（`用深度图` 开关走 id→id，`depth_test.py` 1439/1439，真机验证过输出尺寸从 900×1200 变 300×400）。
