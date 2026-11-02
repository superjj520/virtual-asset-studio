# R31 · 素材库完整性核查 + ComfyUI 底层能力对齐（2026-11-02）

用户的要求是「素材库是否都添加好了，并且跟人家一样的底层能力，不是应付我」。这份文档逐条给出证据和差距，不做修辞。

## 一、素材库：六个源全部接进来了

以应用内真实分类行截图（`artifacts/screenshots/anime-costume.png`、`cloud-load-more.png`）为准——那是用户能看到的界面，不是后台日志：

```
全部 6980 | 人像 1499 | 服装 1847 | 发型 306 | 姿势 569 | 深度 1439 | 动漫衣装 1320
共 8131 张 / 6980 条记录
```

| 源 | 数据位置 | 条数 | 接入版本 |
|---|---|---|---|
| anhao 姿势 | `/data/pose-zh.json` | 1,439（聚成 288 组 × 5 视角） | R16 |
| anhao 服装 | `/data/costume-zh.json` | 1,407 | 已有 |
| anhao 人像 | `/data/portrait-zh.json` | 1,499 | 已有 |
| 深度图库 | 首页内联 `const D=[...]` | 1,439 | R17 |
| 动漫衣装 | 首页内联 `const D=[...]` | 1,320 | R23 |
| char-db-cn | GitHub `data.js` 的 `window.CHARDB` | 1,027（发型 306 / 服装 440 / 姿势 281） | 已有 |

对着 anhao 抄的部分它有的我们都有；动漫衣装 1,320 是我们多出来的。唯一素材 **8,131 vs anhao 5,784**。

顺带核到一件重要的事：本轮用 curl 重新拉 anhao 的三份 JSON 时，`pose-zh.json` 第一次**返回 000（超时）**，`costume-zh.json`/`portrait-zh.json` 各下到 129 KB / 188 KB 就断了（`Unterminated string in JSON`）。重试才拿到完整文件。这说明上游限速很凶——我们的实现必须有降级（`fetchDepthPoses` 等失败返回 `[]`，不拖垮其他源），这一点在 R17 已经做了。

## 二、底层能力：四项对照

| 能力 | anhao 的 ComfyUI 插件 | 我们（R31 之前） | 我们（现在） |
|---|---|---|---|
| 驱动本机工作流 | `/upload/image` + `/prompt` | ✅ 有 | ✅ 有 |
| 参考图进工作流 | `{{composite_image}}` | ✅ `{{reference_image}}` | ✅ 有 |
| 深度图进工作流 | `use_depth` 开关 | ❌ 无 | ✅ `{{depth_image}}` |
| 工作流导入 | `.api.json` 导入导出 | ⚠️ 只有粘贴 textarea | ✅ 可从文件导入 |
| ComfyUI 内选图 | 4 个原生节点 | ❌ 无 | ✅ 6 个节点（见下） |

### 2.1 `{{depth_image}}`

`electron/services/providers/comfyui-image-provider.ts`：

- 新增 `USES_DEPTH_PLACEHOLDER = /\{\{depth_image\}\}/`；
- `buildWorkflow` 入参加 `depthName`，只在该值存在时注入 `depth_image` 变量；
- `refineImage` 入参加 `depthPath` / `depthMediaType`，先 `uploadImage` 再往下传；
- **和参考图同样的保护**：给了深度图但工作流里没有 `{{depth_image}}` 时直接抛错，不发 `/prompt`——否则 ControlNet 拿不到图，用户会以为深度锁定了。

错误文案：「当前 ComfyUI 工作流没有 {{depth_image}} 占位符，深度图会被忽略。请加一个 LoadImage 节点接 ControlDepth，把它的 image 写成 {{depth_image}}。」

### 2.2 `.api.json` 从文件导入

设置页 ComfyUI 区块的 textarea 上方加「从 .json 文件导入」按钮，走新 IPC `settings:read-workflow-file`：

```ts
ipcMain.handle("settings:read-workflow-file", (_event, filePath: string) => {
  const target = absolutePath(filePath, "工作流文件路径");
  if (!target.toLowerCase().endsWith(".json"))
    throw new Error("请选择 ComfyUI 导出的 .json 工作流文件。");
  // 读失败 / 非 JSON / 顶层不是对象，各有中文报错
  return JSON.stringify(parsed, null, 2);
});
```

ComfyUI 里「导出（API）」出来的就是这种对象，粘进来即可。仍然不存在「导出」侧——我们的设置页没有把当前工作流写回文件，这条留着。

### 2.3 ComfyUI 原生节点包 `comfyui-vas-nodes/`

对齐 anhao 的 4 个节点，一次给了 6 个：

| 节点 | 作用 |
|---|---|
| `VAS · 姿势库` | 1,439 条五视角姿势 |
| `VAS · 深度图库` | 1,439 张 ControlNet Depth 专用图 |
| `VAS · 服装库` | 1,407 套 |
| `VAS · 人像库` | 1,499 张 |
| `VAS · 动漫衣装` | 1,320 套 |
| `VAS · 参考板合成` | 身份 + 服装 + 姿态 + 深度拼成 1024×1024 参考板 |

安装：把 `comfyui-vas-nodes/` 整个目录拷进 `ComfyUI/custom_nodes/`，重启 ComfyUI，节点出现在「虚拟资产」分类。

实现要点：

- 数据源与主应用完全一致（同一批 JSON / 同一套内联解析），**不另起一份数据**；
- 首次选择某条素材时下载并缓存到 `~/.cache/vas-nodes/`，之后离线可用；
- 找不到目标图时返回一张 64×64 灰图而不是抛异常——ComfyUI 的工作流不该因为选错一条就整个崩掉；
- `刷新数据` 开关可清掉该站缓存重新拉。

**这个包没有在真实 ComfyUI 环境里跑过**（本机没装 ComfyUI）。语法检查通过，逻辑与主应用同源，但第一次装进 ComfyUI 时请留意控制台。

## 三、还没做的

1. **真实出图验证身份一致性** —— 约 $0.15/张，需要授权。
2. **真实 ComfyUI 出图** —— 需要运行中的 ComfyUI + checkpoint；R22 与 R31 都只有 mock 验证。
3. `.api.json` 只做了导入，没做导出。

## 四、门禁

```
npx tsc --noEmit   无输出
npm test           93 文件 / 458 测试通过
npm run build      通过
```

新增测试（`electron/services/providers/comfyui-image-provider.test.ts`，10 → 12 项）：

- 深度图会上传并填进 `{{depth_image}}`，同时参考图照常注入（断言 `/prompt` 里两个 LoadImage 节点的 image 分别是两张上传结果）；
- 给了深度图但工作流没有占位符时直接报错，且 `/prompt` 请求数为 0。

---

## 五、Round 2 补做：导出 + 节点包实测

### 5.1 `.api.json` 导出（补齐对称能力）

新 IPC `settings:export-workflow-file`：选一个目录，把当前工作流写成 `comfyui-workflow.json`。三条校验与导入对齐——空工作流、非法 JSON、顶层不是对象，各有中文报错。设置页 ComfyUI 区块现在并排两个按钮：「从 .json 文件导入」「导出为 .json」。

### 5.2 节点包真的跑通了数据

上一轮只能做语法检查（本机 Python 3.15 没有 torch / numpy / Pillow）。这一轮把数据层拆成 `comfyui-vas-nodes/vas_data.py`——**只用标准库**，torch 只留在 `nodes.py` 的节点类里。理由是：「数据到底能不能读到」这件事不该被 torch 绑住，装 ComfyUI 之前就该能验证。

新增 `comfyui-vas-nodes/selftest.py`：

```
python3 selftest.py            # 全部站点
python3 selftest.py pose depth # 只看这两个
python3 selftest.py --refresh  # 忽略缓存重新下载
```

**实跑结果（2026-11-02，本机）：**

```
检查 5 个数据源（优先用缓存）：
  ✓ pose: 1439 条     首条：S形站姿・胯部侧顶        图片 HTTP 200
  ✓ costume: 1407 条  首条：象牙白荷叶边针织衫・…     图片 HTTP 200
  ✓ portrait: 1499 条 首条：短发・标准款             图片 HTTP 200
  ✓ depth: 1439 条    首条：S字立ち・腰を横に突き出す · 正面  图片 HTTP 200
  ✓ anime: 1320 条    首条：春 · SPR-0001          图片 HTTP 200
通过 5/5
```

五个站点条数与预期逐一对上（1439 / 1407 / 1499 / 1439 / 1320），首条标题正确解析（含日文站点的 `ポーズ名 · アングル` 拼接），首条图片 URL 全部真实可访问。这比「语法通过」硬得多——它证明节点在弹窗里能列出真实条目、能取到真实图片。

第六个源 char-db-cn 不在节点包里：它是 GitHub raw 的 `window.CHARDB`，主应用走的是同一份数据，但 ComfyUI 侧没有对应的查询路径——如果要，得再加一个 `VASCharacterPack` 节点。这条记在待办。

### 5.3 依然没在真实 ComfyUI 里跑

本机没有 ComfyUI。现在的把握是：数据层实测通过、节点契契约按官方规范写（`INPUT_TYPES` / `RETURN_TYPES` / `FUNCTION` / `CATEGORY`）、torch 侧只用 `torch.from_numpy` 和 `F.interpolate` 这两个最稳的调用。第一次装进 ComfyUI 时看控制台确认。

---

## 六、Round 3：节点包补齐六个源，并抓到一个真实数据 bug

### 6.1 节点包加了 `虚拟资产 · 二次元换装库`

`VASCharacterPack`（`comfyui-vas-nodes/nodes.py`）：数据来自 `window.CHARDB`，按 set 分「发型 / 服装 / 姿势」三类，图片取 `https://charadb-2fi.pages.dev/img/{id}.jpg`。数据层新增 `load_char_db` / `char_db_rows` / `char_db_label` / `char_db_image_url`（同样只用标准库）。

`selftest.py` 现在覆盖六个源，实跑：

```
  ✓ pose:     1439 条    HTTP 200
  ✓ costume:  1407 条    HTTP 200
  ✓ portrait: 1499 条    HTTP 200
  ✓ depth:    1439 条    HTTP 200
  ✓ anime:    1320 条    HTTP 200
  ✓ chardb:   2347 条    HTTP 200（预期 1027 —— 见下）
通过 6/6
```

### 6.2 抓到的 bug：char-db-cn 悄悄加了 `outfit2`，我们一直在错分类 + 重复计数

`chardb` 实测 2,347 条，不是接入时的 1,027。按 set 拆开：

```
hair 306 / outfit 440 / pose 281 / outfit2 1320
```

`outfit2` 的 1,320 个 id 与动漫衣装站的 id **交集正好 1,320**——两个源是同一批数据，只是图分别托管在 `charadb-2fi.pages.dev` 和 `ai-costume-anime-gallery.pages.dev`。

而主应用里这段映射：

```ts
const kind = row.set === "hair" ? "hair" : row.set === "outfit" ? "costume" : "pose";
```

`outfit2` 既不是 hair 也不是 outfit，**落到 else 分支变成「姿势」**。也就是说：上游哪天更新，我们的「姿势」分类里就会混进 1,320 张动漫衣装彩图，`items` 里同时出现动漫衣装两遍（一遍 kind=pose、一遍 kind=anime-costume），而 `counts` 又只按 `set === "pose"` 数 281 条——**卡片池和界面数字会对不上**。

修法（`electron/services/reference-library.ts`）：

```ts
const charDbOnly = charDb.filter(
  (row) => row.set === "hair" || row.set === "outfit" || row.set === "pose",
);
```

`charDbItems`、`imageCounts`、`totalImages` 全部改用 `charDbOnly`，四处的过滤条件统一，不会再各算各的。测试 fixture 里加了一条 `outfit2` 行，断言 `char-db-AUT-0001` **不在** `items` 里。

### 6.3 真机复核

CDP 跑一遍「参考卡组合 → 云端图库 → 姿势」：

```
cards: 48
subtitles: ["姿势 · 全身单人・性感系", ×6]
hasAnime: false
hasPose: 48
allLabel: "全部 6980"
status: "48 张已显示 / 匹配 569（库内 6980）"
firstTitles: ["S形站姿・胯部侧顶 · 编号 P001 · 5 视角", …]
```

48 张全是姿势线稿，没有一张动漫衣装；「库内 6980」与分类行求和一致；「匹配 569」= 288 组 + char-db 的 281 条。截图 `artifacts/screenshots/pose-after-dedup.png`。

**如果没修这个，上游一更新，这个页面就会是另一副样子。**
