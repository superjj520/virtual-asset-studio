# R53 · ComfyUI 插件与 anhao 的逐项对照

上一轮把法线源接上之后，用户的原话还压在这里：「跟人家的一样的底层能力，不是应付我」。
这一轮不靠印象，做一份可重复跑的对照。

`comfyui-vas-nodes/parity_test.py` 已经进了 `npm run verify:nodes`，退出码判定，跑一次就知道有没有退化。

## 对照结果

| anhao 节点 | 我方节点 | 参数 | 输出 |
|---|---|---|---|
| `PoseGalleryNode` | `VASPoseGallery` | 齐 | 3/3 |
| `CostumeGalleryNode` | `VASCostumeGallery` | 齐 | 4/4 |
| `PortraitGalleryNode` | `VASPortraitGallery` | 齐 | 3/3 |
| `CharacterRecipeNode` | `VASCharacterRecipe` | 齐 | 5/6（形态不同，见下） |

我方另有三个 anhao 没有的节点：`VASDepthGallery`（深度图专用）、`VASAnimeCostumeGallery`（动漫衣装 1,320 套）、`VASCharacterPack`（二次元换装 1,027 条）。

## 参数对照（不能只看名字）

anhao 的参数是英文的，我方是中文的。名字对不上不代表能力对不上，所以对照表写死了等价关系：

| anhao | 我方 | 在哪个节点 |
|---|---|---|
| `image_id` | `选择` | 四个 Gallery |
| `resize_mode` | `尺寸模式` | Gallery / Recipe |
| `width` / `height` | `宽度` / `高度` | Gallery / Recipe |
| `flip_horizontal` / `flip_pose_horizontal` | `水平镜像` | Gallery / Recipe |
| `use_depth` | `用深度图` | `VASPoseGallery` |
| `use_depth` | `深度`（直接给 IMAGE） | `VASCharacterRecipe` |
| `style_preset` | `画风预设` | Recipe |
| `extra_prompt` | `补充提示词` | Recipe |

`use_depth` 这一项两个节点不一样，是**故意不一样**：anhao 的 Pose 节点用布尔开关自己从库里换深度图，我方也是（`用深度图`，走 `_depth_choice_for_pose` 按 id 配对）；而 anhao 的 Recipe 节点也是布尔开关，我方直接开一个 `深度` 输入槽——用户手上已经有那张图了，再让他填个布尔开关去猜反而绕。

## 本轮真的补上的缺口

上一版 `VASCharacterRecipe` 只回传一张拼图 + 中英提示词，**输出尺寸是写死的 1024×1024**（源码里 `side = 512`，2×2 网格）。anhao 那个节点有 `resize_mode` / `width` / `height` / `flip_pose_horizontal`，我方一个都没有——用户想把参考板做成 1280×768 就没路可走。

补了四个参数：`尺寸模式` / `宽度` / `高度` / `水平镜像`。

`尺寸模式` 不是摆设：

- **裁切填满**：保持比例放大到盖满格子，再从中间裁掉多余部分。人脸不会被拉扁。
- **缩放到指定尺寸**：直接拉伸到格子大小。
- **原图尺寸**：落到和上一条相同的分支，因为 2×2 网格必须撑满，原图尺寸在这里没有可执行的含义——写成拉伸，而不是假装支持。

这一点是刻意的：加一个参数却三种模式都走同一条路，就是用户说的「应付」。

## 输出数量的差异不是缺口

anhao 的 `CharacterRecipeNode` 回传六项：人像图、服装图、姿势图、三合一拼图、中文 Prompt、英文 Prompt。
我方 `VASCharacterRecipe` 回传五项：参考板、宽、高、中文提示词、英文提示词。

少的是那三张单图。但两边的输入模型不同：

- anhao 收的是 `portrait_id` / `costume_id` / `pose_id` 三个**字符串**，节点自己按 id 去库里加载，所以下游只能从它的输出拿图。
- 我方收的是 `身份` / `服装` / `姿态` / `深度` 四个 **IMAGE**，那三张图本来就在用户画布上，随便接哪条线都行。

所以少的不是能力，是「重复给一遍」。

`parity_test.py` 里这一条写在 `OUTPUT_SHAPE_OK` 里并附了原因——豁免要有理由，不是默认放过。

## 上一轮的坑，记在这里免得再踩

对照脚本第一版报了五处假缺口，全是我自己解析错了：

1. `VASPoseGallery` / `VASPortraitGallery` 输出报 0 个——它们沿用基类 `_GalleryBase` 的 `RETURN_TYPES`，脚本只查子类自己的赋值。
2. `用深度图` 报缺失——代码写的是 `base["optional"]["用深度图"] = (...)` 再 `return base`，脚本只看函数最后一句 `return base`，走不到前面的赋值。
3. `base["optional"]["用深度图"]` 是嵌套 Subscript，第一版把里层当成 outside 的 key 去查，方向反了。

修法：输出回落到基类、整函数 `ast.walk`、内层 key 加到外层 key 指的集合里。

**教训**：静态解析报出来的「缺口」，要先怀疑解析器。真缺口是 `VASCharacterRecipe` 的尺寸参数，那个核对了源码 `side = 512` 才确认。
