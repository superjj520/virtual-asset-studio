# R38 参考板节点补画风预设与提示词

日期：2026-11-02

## 补的是什么

anhao 的 `CharacterRecipeNode` 有两个我们没有的输入：

- `style_preset`：画风下拉（`STYLE_PRESETS`）
- `extra_prompt`：可选补充提示词

它们的输出也多两项：中文合成 Prompt、英文合成 Prompt。

我们的 `VASCharacterRecipe` 只有四张图 + 底色，输出是「参考板 / 宽 / 高」——选完图，提示词还得自己去 CLIPTextEncode 里手写。

这轮补上。

## 改动

`comfyui-vas-nodes/nodes.py`：

- `VASCharacterRecipe.INPUT_TYPES` 的 `optional` 加 `画风预设`（12 种枚举）与 `补充提示词`（多行字符串）。
- `RETURN_TYPES` 从 3 项变 5 项：`("IMAGE", "INT", "INT", "STRING", "STRING")`，新增「中文提示词」「英文提示词」。
- 抽出 `_recipe_prompt(style, extra) -> (zh, en)`，`compose()` 里调用。抽出来是因为它不需要 torch，能单独测。
- 新增 `STYLE_PRESETS`（12 种）与 `STYLE_PRESET_EN`（中英映射）。

## 两个判断

### 画风名单必须以客户端为准

第一版我是凭印象写的：`时尚大片 / 日系胶片 / 厚涂插画 / 黑白纪实`……

跑去和 `src/shared/reference-styles.ts` 一对，**12 个里错了 5 个**。客户端实际是：

```
电影写实 时装大片 棚拍肖像 自然日光 暗调氛围 东方水墨
动画赛璐璐 漫画墨线 古典油画 水彩插画 赛博霓虹 胶片颗粒
```

名字对不上不是小事：工作流里选到的「画风」和界面上用户点的那一个不是同一件事，同一个词在两处含义不同。已按客户端重写，并在 `prompt_test.py` 里加了一条硬断言——两边集合必须相等，任何一边改了另一个没跟上就会红。

### 英文提示词不逐字翻译

「电影写实」直译 `cinematic realism` 对 CLIP 基本没用。英文侧按摄影术语写：

```python
"电影写实": "cinematic photography, natural skin texture, realistic lens falloff, shallow depth of field",
"暗调氛围": "low-key lighting, moody atmosphere, dark tones",
"赛博霓虹": "cyberpunk neon, magenta and cyan rim light",
```

这也是 anhao 的做法（他们的 `en_parts` 是自己拼的英文短语，不是翻译中文）。

另外：补充提示词只在中英两份里都放，但**英文侧只接 ASCII**。用户写「银色双眸」时，中文那份带、英文那份不带——中文塞进 CLIP 的英文分支等于噪声。

## 验证

```
$ python3 prompt_test.py
✓ 提示词构建全部符合预期
  ✓ 参考板画风预设中英分列，中文补充不污染英文
  ✓ 12 种画风与客户端名单一致，中英映射无缺漏

$ python3 contract_test.py
✓ 7 个节点全部符合 ComfyUI 加载规范
✓ 每个 run() 的返回值个数都和 RETURN_TYPES 对得上
```

实际输出：

```
>>> _recipe_prompt("暗调氛围", "银色双眸")
('暗调氛围，银色双眸', 'low-key lighting, moody atmosphere, dark tones')

>>> _recipe_prompt("暗调氛围", "silver eyes")
('暗调氛围，silver eyes', 'low-key lighting, moody atmosphere, dark tones, silver eyes')
```

## 诚实边界

- 画风和客户端「名字一致」已经验证，「效果一致」没有——客户端的 `positive` 是一句完整中文描述（`电影写实摄影，自然皮肤纹理，真实镜头光晕…`），节点这边只给一句风格短语。同一个画风在两处的实际提示词强度不同。
- 没在真实 ComfyUI 里跑过。本机没有 ComfyUI、没有 checkpoint、没有 torch，`compose()` 的像素路径只有假 PIL 覆盖。
- 中文补充进英文侧从「原样带上」改成「只在 ASCII 时带上」，是取舍不是最优解：用户写英文补充时两边都有，写中文时英文侧就少一段信息。
