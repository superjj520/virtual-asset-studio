# R34 工作流参数级编辑

日期：2026-11-02

## 为什么要做

R33 把 anhao 的 ComfyUI 插件源码（`comfyui_plugin/nodes.py`、`routes.py`、`docs/comfyui-workflow-parameters.md`）拉下来逐行比对时，发现我们缺一整层能力：

他们的工作流不是「一整段 JSON 粘进去就完事」，而是能从 API JSON 里**自动识别可编辑参数**，生成布尔 / 数值 / 文本 / 枚举控件；再用 `_meta.studio.controls` 让工作流作者声明中文名、说明、分组、枚举标签；`hiddenInputs` 隐藏内部路由用的比较符和正则；导出时把高级参数一起带走。

我们这边只有「整段粘贴 / 从 .json 导入」，用户想调一步 CFG 得在 JSON 里翻 `"cfg": 7`。

## 做了什么

### `src/shared/workflow-parameters.ts`（新建）

只有纯函数，不碰 Electron，不碰文件系统。

```ts
listWorkflowParameters(workflow)   // → { parameters, linkedInputs, staleHints, placeholderInputs }
parameterKey(nodeId, input)        // → `${nodeId}/${input}`
applyWorkflowOverrides(workflow, overrides, report?)  // → { workflow, applied, skipped }
resetWorkflowOverrides()
```

识别规则：

- **连线**（`[节点id, 输出序号]` 这种二元数组，`[0]` 是字符串或数字、`[1]` 是数字）不生成控件，计入 `linkedInputs`。
- **强制连接**（对象里带 `__value__`）同样跳过。
- **纯占位符字段**（值整体是 `{{seed}}` 这类）不生成控件，计入 `placeholderInputs`——它们由系统在提交时注入，给控件只会被覆盖。
- 其余标量按类型分 `boolean` / `number` / `string` / `enum`（对象带 `options` 时）。

写回规则：

- **类型必须与原值一致**才写回。避免把字符串 `"20"` 写进数字步数。
- 节点不存在、字段被连线时进 `skipped`，不凭空造节点。

排序：推荐优先 → 分组名 → `order`（控件声明顺序）→ nodeId → input。

### 控件声明

`_meta.studio.controls` **必须挂在字段所属的节点上**，不是工作流顶层。文档里那些 `{input, label, group, order, description, options}` 都支持，另外支持 `node` 字段跨节点声明：

```json
{"3":{"class_type":"KSampler","inputs":{"cfg":7,"batch_size":1},"_meta":{"title":"采样器",
  "studio":{"controls":[
    {"input":"cfg","label":"CFG 强度","group":"采样","order":1},
    {"input":"batch_size","node":"5","label":"每批张数"}
  ]}}}}
```

`studio.hiddenInputs` 里列出的字段不生成控件。

### 接线

- `electron/services/providers/comfyui-image-provider.ts`：`buildWorkflow` 在 `applyWorkflowPlaceholders` 之后应用 `applyWorkflowOverrides`，先合并构造参数里的 `overrides()` 与单次请求的 `input.overrides`。import 路径是 `../../../src/shared/workflow-parameters`——写成 `../../shared/...` 会让三个测试文件报 `Cannot find module`。
- `electron/runtime.ts`：`settings:save-comfyui` 入参加 `overrides`，存进 `comfyui_overrides`；地址清空时一并清掉，避免下次误连。
- `src/App.tsx`：设置页 ComfyUI 区块下方是参数面板，`恢复全部` 清空覆盖值，改过的项加粗。工作流 JSON 解析失败时返回空报告，不炸整个设置页。

## 踩到的坑

1. **`_meta` 放错层级**：第一版示例放在工作流顶层，面板显示 `3 / cfg` 这种原始名，看起来像控件声明没生效。实际是必须挂在节点上。
2. **跨节点声明导致误报过期**：`hintByInput` 只按字段名索引，而控件全写在 node `"3"` 的声明里、其中一条明确指向 node `"5"`；遍历 node 3 时匹配不上就判成「元数据过期」，遍历 node 5 时又没声明可用。修法是把收集提前成独立一遍，建 `hintsByKey`（key = `owner/input`，`owner` 取 `hint.node` 否则当前节点）与 `titleByNode`。
3. **测试文件用的是 `it` 不是 `test`**：在该文件里写 `test(` 会整文件 0 tests 并报 `ReferenceError: test is not defined`。
4. **孤儿 Electron 进程**：为了截图反复 spawn，`child.kill("SIGKILL")` 只杀 `node_modules/.bin/electron` 包装层，Electron 主进程变孤儿继续占着 `--remote-debugging-port`。脚本于是连到上一个实例，加载旧 bundle（`index-8tsYyUC3.js`，磁盘上已是 `index-DiA3aII8.js`），把「修复没生效」这种假象当成真 bug 排查了半天。取证脚本已改成 `detached: true` + `process.kill(-child.pid, "SIGKILL")` 整组杀。

## 验证

- `npx tsc --noEmit` 无输出。
- `npm test`：94 文件 / 475 测试全过。
- `src/shared/workflow-parameters.test.ts` 13 项，覆盖：枚举与标量识别、连线跳过、占位符不生成控件、`hiddenInputs` 排除、节点级声明生效、跨节点 `node` 字段匹配不误报、类型不一致不写回、节点缺失进 `skipped`、排序。
- `npm run build` 通过。

## 诚实边界

- 参数面板只做「识别 + 覆盖值」，**不校验**覆盖值在 ComfyUI 侧是否合法（比如枚举传了不在列表里的值）。真出错由 ComfyUI 返回的报错原样显示。
- 没有在真实 ComfyUI 上跑过——本机没有 ComfyUI 服务也没有 checkpoint。参数面板的截图证据来自开发构建，覆盖值能写进工作流 JSON 有单测证明，但「提交给 ComfyUI 后被正确执行」这一步没验证。
- 与 anhao 的 `referenceCombinations`（声明允许的参考图组合）、`imageRole: "character_sheet"`（标记设定集入口）还没做，本轮只对齐了参数编辑这一段。

## 真机验收（2026-11-03 补）

之前几轮一直拿不到真机证据：临时 CDP 脚本跑完不退出，事件循环被 ws 和 child 句柄挂住，于是「卡死 10 分钟 → pkill → 重试」成了常态，中途还留下过 16 个孤儿 Electron。

现在固化成一条命令：

```bash
npm run rebuild:native:electron   # npm test 会把 better-sqlite3 重建成 node ABI
npm run verify:panel
```

脚本在 `scripts/verify-comfyui-panel.mjs`，三处必要设计：

- **每个 CDP 调用带 30s 超时**，某一个请求挂住不会拖死整个脚本
- **240s 看门狗**，超时直接 `exit(2)` 并清理，不给「卡住但不报错」留空间
- **整组杀进程**（`detached: true` + `process.kill(-pid)`），跑完残留 0，实测 `pgrep` 计数归零

12 项断言，全部通过：

```
✓ 加载的是本地构建的 bundle — ./assets/index-C8ofEUFd.js
✓ 进入设置页
✓ 填入工作流 JSON — ComfyUI 工作流 JSON
✓ 参数面板渲染出来了 — 6 个可调参数
✓ 声明了中文名的参数显示中文 — CFG 强度推荐
✓ 枚举参数显示可读标签
✓ 跨节点声明（batch_size 指向 5）显示为「每批张数」
✓ 跨节点声明不再被误报为「元数据过期」
✓ 占位符字段不生成控件 — 无占位符字段
✓ 「怎么让参数面板显示中文名」的说明在页面上
✓ 改 CFG 的值能落到控件上 — now=12
✓ 截图已保存
```

截图 `artifacts/screenshots/comfyui-parameters.png`：6 个参数（CFG 强度 12 / 采样器 Euler / **每批张数 1** / denoise / scheduler / 9-filename_prefix），没有「元数据可能过期」的警告，`{{seed}} {{steps}} {{ckpt_name}} {{width}} {{height}}` 五个占位符字段被排除在控件之外，计入「另有 5 个连线输入不可直接改」。

第一条断言「加载的是本地构建的 bundle」是补上一次教训：之前脚本连到残留的旧 Electron，加载 `index-8tsYyUC3.js`，而磁盘上是 `index-DiA3aII8.js`，于是把「修复没生效」当成真 bug 排查了半天。
