# R41 深度图能看能选，但出图时没有深度语义

R17 接入了 1,439 张姿势深度图（`深度 1439` 分类），R31/R33 又让 ComfyUI 节点支持 `{{depth_image}}` 和「用深度图」开关。这轮去查这条链路到底通不通，结论是**只在 ComfyUI 节点那一侧通，客户端参考卡这一侧没通**。

## 证据链

| 环节 | 现状 |
|---|---|
| 云端图库 | 有「深度 1439」分类，能搜、能翻页、能点选 |
| 参考卡槽位 | 槽位固定四个：身份 / 服装 / 姿态 / 场景（外加最多两张补充参考），**深度图会被塞进其中任意一个槽** |
| 槽位入参 | `ReferenceSheetSlotInput = { role, assetId }` —— **不带 kind**，进了合成逻辑后已经分不清这是深度图还是普通参考图 |
| 绑定记录 | `ReferenceAssetBinding = { assetId, role, priority }` —— 同样没有来源分类 |
| 出图请求 | `refineWithResult` 的入参只有 `prompt / size / referencePath / referenceMediaType / references / model / onRemoteTask`，**从不传 depthPath** |
| ComfyUI provider | `refineImage({ depthPath })` 是支持的，`{{depth_image}}` 占位符也校验了——但没有人给它传值 |

结论：用户把深度图选进参考板，它会被当成一张普通参考图拼进那张 1440×960 的拼图里。模型看到的是一块灰白线稿，既没有 ControlNet 的深度约束，还可能把线稿风带进出图。

跟 R24「6,980 条素材界面只露 48 张」是同一类问题：数据做大了，最后真正用起来的那一环没接。

## 这轮做了什么

在云端图库停在「深度」分类时，明确告诉用户这条路径的真实行为：

> 深度图是给 ComfyUI 的 ControlNet 用的：选进参考板只会被拼进那张图里当普通参考图，不会变成深度约束。要按深度出图，请在 ComfyUI 的「姿势库」节点上打开「用深度图」开关，它会按 id 换成同一张图的深度版。

改动：`src/reference/ReferenceSheetComposer.tsx` 加 `reference-sheet-depth-note`（`role="note"`），`src/styles.css` 加对应样式。测试 `src/reference/ReferenceSheetComposer.depth-note.test.tsx` 三项：全部分类不显示、深度分类显示且含「不会变成深度约束」「用深度图」、切回全部后消失。

## 为什么没有直接「修通」

参考卡的本质是**把四张图压成一张送模参考**（R16 的设计）。深度图的语义跟它是冲突的：深度图不是「参考画什么」，而是「约束构图骨架」。把它拼进拼图，等于让模型把一张线稿当风格参考。

正确的做法是给深度图一条**独立通道**，不占四个槽位之一：

1. 参考卡加一个可选的「深度图」输入（不参与拼图）
2. 合成时不拼它，只记进 recipe
3. 出图时单独走 `depthPath` → ComfyUI 的 `LoadImage` + ControlNet
4. 其他 provider（OpenAI / fal / Gemini）没有 depth 通道，忽略并说明

这属于产品结构变更（加第五个输入位），按 `AGENTS.md`「一次只解决一个可观察的问题，不要在同一改动里同时替换信息架构与业务逻辑」，没有塞进这轮。

## 诚实边界

- 这轮只做了「说明真相 + 测试锁定」，深度图仍然没有 depth 通道。
- ComfyUI 节点侧的能力是完整的：`用深度图` 开关走 id→id 匹配，`depth_test.py` 实测 1439/1439，真机也验证过（换成深度图后输出尺寸从 900×1200 变成 300×400）。
- 说的是「参考卡这一侧没通」，不是「深度图没用」。
