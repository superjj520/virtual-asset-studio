# R33 · 按对方源码逐项对齐 ComfyUI 节点能力

## 为什么这次不一样

前几轮说「和 anhao 的底层能力一样」，依据是我读过的 README 与自己的推测。这次把对方插件源码拉下来逐行比对：

```
comfyui_plugin/nodes.py                      14386 B
comfyui_plugin/routes.py                      6046 B
docs/comfyui-workflow-parameters.md           3159 B
```

## 逐项对照

| 能力 | anhao `PoseGalleryNode` | 我们（改前） | 我们（改后） |
|---|---|---|---|
| 选图 | `image_id` STRING | 选择（下拉） | 选择（下拉） |
| 尺寸模式 | `resize_mode`：原图 / 缩放 / 裁切 | ❌ 无 | ✅ 三档 |
| 尺寸 | `width` 1024 / `height` 1280 | ❌ 无 | ✅ 64–4096，步长 8 |
| 镜像 | `flip_horizontal` | ❌ 无 | ✅ 水平镜像 |
| 深度图开关 | `use_depth`（同站 depth 目录） | ❌ 无 | ✅ 跨库匹配 |
| **输出提示词** | `("IMAGE","STRING","STRING")` → 图 / id / **中文提示词** | ❌ 只有图和名称 | ✅ 图 / 名称 / 提示词 |

最后一行是整个对照里最要紧的：**anhao 选完姿势会直接给一句中文描述**，接 `CLIPTextEncode` 就能用；我们之前只出图，用户还得自己想词。

## 提示词怎么拼（照对方口径）

```python
# 姿势
f"{角度}视角，动作：{姿势名称}（{体系}·{分类}）"
# 服装
f"身穿{分类}：{服装名称}（细节：{标签前 8 个}）"
# 人像
f"人物面部与发型：{发长}、{发型名称}（{分区}）"
```

深度库是日文字段，单独一句：`f"{アングル}视角深度图，动作：{ポーズ名}"`。char-db-cn 只有英文关键词，直接原样输出。

## `use_depth` 我们没有照抄

anhao 的深度图和姿势图在同一个站点的不同目录（`img/` → `img/depth/`），所以它一个开关就能切换。

我们的深度图来自**独立站点**（`ai-pose-depth-gallery.pages.dev`），路径结构完全不同。所以做的是：勾上「用深度图」后，拿所选姿势的编号（如 `P001`）去深度库里就近匹配一条。匹配不到就退回原姿势图，不报错。

这比 anhao 的写法多做一层匹配，但换来的是两个源各自独立——深度站挂了不影响姿势库。

## 验证

```
$ python3 contract_test.py
✓ 7 个节点全部符合 ComfyUI 加载规范

$ python3 prompt_test.py
✓ pose: 斜侧视角，动作：S形站姿（全身单人・标准系·立ち）
✓ costume: 身穿春：象牙白针织衫（细节：knit、ivory、frill）
✓ portrait: 人物面部与发型：长发、微卷（正脸参考）
✓ depth: 側面视角深度图，动作：S字立ち
✓ 空条目不抛异常
✓ 提示词构建全部符合预期
```

节点契约实读：

```
必填: ['选择', '尺寸模式', '宽度', '高度', '水平镜像']
可选: ['刷新数据', '用深度图']
输出: ('图片', '名称', '提示词')
```

## 还是没验的

- `_to_tensor` 里的缩放与裁切只在假 PIL 下走过分支，没有真实像素进出。本机 Python 3.15 无 torch。
- `_matching_depth_choice` 的匹配率没统计——需要真跑一遍 288 组姿势看能匹到几组，这件事得在装了 ComfyUI 的机器上做。

## 顺带发现：对方另有一个我们完全没有的能力

`docs/comfyui-workflow-parameters.md` 描述的是一整套**工作流参数编辑层**：

- 从 API JSON 里自动识别可编辑的布尔 / 数值 / 字符串 / 枚举，生成控件
- `_meta.studio.controls` 声明推荐参数（含分组、说明、枚举标签）
- `_meta.studio.referenceCombinations` 声明允许的参考图组合
- `_meta.studio.imageRole: "character_sheet"` 标记角色设定集入口
- 导出时带上当前高级参数

我们现在是「工作流整体粘贴 / 导入 JSON」，没有参数级编辑。这是下一步的真实差距，不在本轮范围。
