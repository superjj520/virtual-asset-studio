# R36 参考图组合声明

日期：2026-11-02

## 背景

R33 拉 anhao 的 `docs/comfyui-workflow-parameters.md` 时，最后两条没做：`referenceCombinations` 与 `imageRole: "character_sheet"`。这轮补第一条。

他们原文的意思：工作流可以在节点的 `_meta.studio.referenceCombinations` 里声明「允许用户提供哪几种参考图组合」，网页按用户实际提供的图精确匹配；没声明的旧工作流保持原样。

对应到我们这边的问题：用户挂了 3 张参考图，工作流里却只有 1 个 `{{reference_image}}` 占位符。以前会在填写的时候直接报错（R22 加的），但如果工作流有 2 个占位符、用户挂 3 张，第 3 张就没地方去——不报错，静默丢掉，用户以为身份、服装、姿态都锁住了。

## 做了什么

### `src/shared/workflow-parameters.ts`

```ts
referencePlaceholderNodes(workflow): string[]      // 哪些节点的 fields 吃 {{reference_image}}
declaredReferenceCombinations(workflow): string[][] // 读 _meta.studio.referenceCombinations
checkReferenceCombinations(workflow, provided): ReferenceCombinationCheck
```

规则：

- 声明可以挂在任意节点的 `_meta.studio.referenceCombinations`，值形如 `[["1","2"], ["1","3"], ["31"]]`。
- 匹配时把节点 id 排序后按 `+` 拼起来比，顺序不影响结果。
- **没声明就放行**，旧工作流不用改。
- 不通过时给一句人话：`这张工作流只接受这些参考图组合：4；现在提供的是 4 + 5。`

### `electron/services/providers/comfyui-image-provider.ts`

`buildWorkflow` 在占位符填充之后、参数覆盖之前做校验：遍历填充后的工作流，找出 `inputs` 里某个值等于本次上传文件名的节点，这组节点就是「用户实际提供的组合」，再拿去和工作流声明的名单比。不在名单里就抛错，**不发 `/prompt`**。

顺序很重要：必须用填充后的工作流找节点——填充前占位符还是 `{{reference_image}}` 字符串，所有吃占位符的节点都会命中，分辨不出用户这次到底给了几张。

## 验证

- `src/shared/workflow-parameters.test.ts` 加 3 项（占位符节点识别、声明能匹配也能拦住、没声明放行），16 项全过。
- `electron/services/providers/comfyui-image-provider.test.ts` 加 1 项：工作流声明只接受 `[["4"]]`，用户给两组参考图 → 抛「只接受这些参考图组合」，且 `/prompt` 请求数为 0。
- 全量：`npx tsc --noEmit` 无输出；`npm test` 94 文件 / 479 测试全过。
- `python3 contract_test.py` / `prompt_test.py` / `depth_test.py` / `selftest.py` 仍全过。

## 踩坑

- 测试里 `ensureReferenceFile` 那类辅助函数是我凭印象写的，实际这个文件用的是 `mkdtempSync` + `writeFileSync(ONE_PIXEL_PNG)`，`references` 是 `{ path, mediaType }` 对象数组而不是字符串数组。照印象写测试会直接 `ReferenceError`。
- `ComfyUiImageProvider` 的构造参数 `baseUrl` / `checkpoint` / `workflow` / `overrides` **全是函数**，不是值。传字符串会得到 `this.options.baseUrl is not a function`——这个报错信息本身挺清楚，但第一版测试写错时先看到的是断言不匹配，容易误以为是业务逻辑没生效。

## 诚实边界

- 只做了「拦住不合法的组合」，没做「自动挑一个合法组合」。如果用户的参考图和任何声明都对不上，只能自己改参考图或改工作流，界面上没有一键修复。
- `imageRole: "character_sheet"`（把某个节点标记成角色设定集入口）还没做。它是给「上传整张设定集」用的，我们的参考卡是 4 槽 + 补充，语义不一样，需要先想清楚映射再动。
- 仍然没有在真实 ComfyUI 上跑过——本机没有 ComfyUI 服务。这些校验都在提交前发生，走的是纯逻辑，风险比出图路径低，但也不能算已验证。
