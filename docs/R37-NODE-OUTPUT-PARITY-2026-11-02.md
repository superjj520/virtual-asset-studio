# R37 节点输出对齐：一个静默丢值的 bug 和契约测试的盲点

日期：2026-11-02

## 怎么发现的

R33 拉 anhao 的 `comfyui_plugin/nodes.py` 对照时，逐个节点比了输出：

| 他们的节点 | 输出 |
| --- | --- |
| `PoseGalleryNode` | 姿势图 / 图片ID / 姿势提示词 |
| `CostumeGalleryNode` | 服装图 / 图片ID / 中文服装描述 / **英文服装Prompt** |
| `PortraitGalleryNode` | 人像图 / 图片ID / 人像发型描述 |
| `CharacterRecipeNode` | 人像图 / 服装图 / 姿势图 / 三合一拼图 / 中文合成Prompt / 英文合成Prompt |

再回头看我们自己的 `VASCharacterPack`：

```python
RETURN_TYPES = ("IMAGE", "STRING")
RETURN_NAMES = ("图片", "名称")

def run(self, ...):
    return tensor, 选择, _build_chardb_prompt(row)   # 三个值
```

**声明 2 个输出，实际返回 3 个。** ComfyUI 严格按 `RETURN_TYPES` 截取，第三个值被直接丢掉——`_build_chardb_prompt` 写了一整段、每次都算、每次都扔。界面上不报错、加载也不报错，只有把「声明几个」和「返回几个」摆在一起看才发现。

这是 R33 那次改动的遗留：当时我加提示词只改了 `return`，没同步 `RETURN_TYPES`。

## 为什么契约测试没抓到

`contract_test.py` 当时查的是：

- `NODE_CLASS_MAPPINGS` 是 dict、和 `NODE_DISPLAY_NAME_MAPPINGS` 键一一对应
- 每个 `INPUT_TYPES()` 条目是 `(类型, 参数字典)` 二元组
- `RETURN_TYPES` 与 `RETURN_NAMES` 等长
- `FUNCTION` 在类里存在、`CATEGORY` 存在

全是**声明之间**的一致性，没有一条去看**实现**。声明自己和自己对得上，实现多返回一个就没人管。

补了一条 `check_returns()`：用 `ast` 解析 `nodes.py`，找到每个类的 `RETURN_TYPES` 元组长度，再找它的 `run()` / `compose()` 里所有 `return` 语句的元组长度，不相等就报错。

```python
for sub in ast.walk(item):
    if isinstance(sub, ast.Return) and isinstance(sub.value, ast.Tuple):
        got = len(sub.value.elts)
        if got != declared:
            problems.append(f"{node.name}.{item.name}() 返回 {got} 个值，但 RETURN_TYPES 只声明了 {declared} 个")
```

修完跑：

```
✓ 7 个节点全部符合 ComfyUI 加载规范
✓ 每个 run() 的返回值个数都和 RETURN_TYPES 对得上
```

## 顺带补的英文输出

anhao 的服装节点给两份文本：中文描述给中文模型，英文 Prompt 给 SDXL 这类英文 CLIP。我们的服装库 `标签` 字段本身就是英文（`ivory frill knit denim mini skirt...`），只是没单独输出。

改动：

- `VASCostumeGallery` → 4 输出（图片 / 名称 / 中文描述 / **英文关键词**）
- `VASAnimeCostumeGallery` → 同样 4 输出，英文取 `キーワード` 原值
- 新增 `_english_prompt(site, row)` 与 `_english_for(site, choice)`，服装取标签前 12 个、动漫衣装取关键词整串

姿势、深度、人像没加——那三个库没有成体系的英文标签，硬拼出来的英文反而比中文更难用。

## 现在的对照

我们 7 个节点 vs 他们 4 个：

| 能力 | anhao | 我们 |
| --- | --- | --- |
| 姿势选图 + 提示词 | ✅ | ✅ |
| 姿势换深度图 | ✅ 同库路径替换 | ✅ 跨库按 id 匹配（R35，100%） |
| 服装选图 + 中英双语 | ✅ | ✅（本轮补齐） |
| 人像选图 + 描述 | ✅ | ✅ |
| 深度图单独选 | ❌ | ✅ |
| 动漫衣装选 | ❌ | ✅ 1,320 套 |
| 二次元换装库 | ❌ | ✅ 1,027 条 |
| 三合一拼图 | ✅ | ✅（我们的 4 格参考板，含深度） |
| 尺寸模式 / 宽高 / 水平镜像 | ✅ | ✅ |
| 画风预设 + 补充提示词 | ✅ | ❌ 还没做 |

最后一行是真差距：`CharacterRecipeNode` 有 `style_preset`（画风下拉）和 `extra_prompt`（补充提示词）。我们客户端有 12 种画风预设，但节点里没有。

## 诚实边界

- 返回值个数检查是静态分析（`ast`），能抓「个数不对」，抓不到「类型不对」——比如声明 `STRING` 却 `return` 一个 numpy 数组。真要覆盖得在真 torch 环境里跑一遍。
- 英文关键词是从标签直接拼的，没做清洗（可能有重复词、大小写混杂）。SDXL 对这些不敏感，但质量不如人工整理过的 prompt。
- 仍然没有在真实 ComfyUI 里加载过这些节点。本机没有 ComfyUI 服务、没有 checkpoint、没有 torch。
