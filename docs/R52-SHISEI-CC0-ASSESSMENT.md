# R52 · Shisei（CC0 姿势库）接入评估

结论先写：**暂时不接**。理由在第四、五节。这份文档是为了下次有人问「为什么不接」时，
不用再从零查一遍。

## 一、这是什么

[github.com/wquguru/shisei](https://github.com/wquguru/shisei) —— 自制的姿势参考库，
280 个姿势 × 5 个视角，线稿 + 黏土 + 深度 + 法线贴图，另有少量实拍。
在线画廊 `shisei.indaloop.app`。

作者在 README 里明确写了它和我们上游的关系：

> The pose list — which poses, their numbering, their names and categories —
> follows the public catalog of ai-pose-gallery by ギア (@giaaibusi);
> the Chinese, English and Korean names are translations of it.
> Only the list is shared: every image here was made for this project.

也就是说：**名单同源，图像全是自己画的**。我们用的 anhao 那套是同一个名单的另一套图。

## 二、授权（这是它最大的优点）

- **图像**（`images/` 与 Release 压缩包）：CC0 1.0，商用、修改、再分发都可以，无需署名
- **代码与文档**：Apache 2.0
- **姿势名单**（选哪些、怎么编号、叫什么、分类）：来自 ai-pose-gallery 的公开目录，
  只做署名，**不在任何授权之内**

第三点是唯一需要留意的地方：图能用，但「这个编号叫这个名字」这件事的归属仍是上游。
我们已经在用同一份名单，所以不构成新增风险。

对比 open-pose-costume（R44 查过）：那边写死「不可商用、再分发需书面授权」，一张都不能收；
shisei 是干净的 CC0。这是它值得评估的原因。

## 三、实测规模

| 目录 | 内容 | 数量 |
|---|---|---:|
| `images/line/` | 线稿姿势，w300/w600/w900 三档 | 1,440 张（288 姿势，通过的视角） |
| `images/clay/` | 黏土渲染，与线稿逐像素对齐 | 944 张 |
| `images/depth/` | 深度图，供 ControlNet Depth | 944 张 |
| `images/normal/` | 法线图，供 ControlNet Normal | 944 张 |
| `images/photo/` | AI 生成的成人实拍感渲染 | 89 张 |
| `images/scene/` 等 | 场景、服装、道具、家具、光、动物 | 各只有几个概念图，不是数据集 |

系列分布：std 73 / upper 80 / sexy 80 / duo 55 = 288 个姿势。
分级：general 109 / suggestive 179（后者在画廊里默认模糊）。

## 四、为什么不接（两个硬理由）

### 1. 姿势与现有六源完全重复

anhao 的 1,439 张与我们已有的姿势是同一个名单。shisei 的 1,440 张是**同一批姿势的另一套画**。
接进来用户会看到两个「S形站姿」，分不清该用哪个。R24 的教训是「加了数据源要验证用户翻得到」，
这里的问题相反：翻得到，但是重复的。

id 也对不上，需要按「系列 + 编号」硬映射（anhao `full_sexy_P001` ↔ shisei `S001`），
一旦上游重编号就断。

### 2. 唯一的真增量是法线图，但它现在没有消费端

我们已有的深度图来自 `ai-pose-depth-gallery.pages.dev`（第三方，1,439 张），
shisei 的 944 张深度是另一套画风。normal map 我们**确实一张都没有**，
但当前 ComfyUI 工作流只接了 `{{depth_image}}`，没有任何节点吃 normal。
接进来也只是多一个用户点了没反应的分区——这正是「应付」的定义。

> **后续（R29 已处理）**：上面第 1 条重开条件已经满足——ComfyUI 侧先补了 `{{normal_image}}`
> 通道（提交 `45f76d4`），所以法线图不再是「点了没反应的分区」，已作为第七个源接进来
> （944 张，分类名「法线」）。姿势本身仍然不重复收录，理由见上文。

## 五、什么条件下值得重开

1. ~~**ComfyUI 侧先支持 ControlNet Normal**~~ —— **已满足**（`{{normal_image}}` 已接入
   `comfyui-image-provider.ts`，944 张 normal 已作为「法线」分类上线）。
2. **或者现有深度源挂掉**：它是第三方个人站，没有 SLA。shisei 的 CC0 深度图可以作为备份源，
   按「系列 + 编号」映射，接受画风差异。
3. **或者上游名单扩到男性单人**：shisei 目前单人系列全女，duo 系列（55 个姿势）里有男性主体，
   但没有男性单人姿势——和我们现状一样，接它也解决不了 R48 记的那个缺口。

## 六、怎么验证上面这些数

```bash
# 名单与四语名字
curl -sL https://raw.githubusercontent.com/wquguru/shisei/main/data/catalog.json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d)); print([p['id'] for p in d[:5]])"

# 授权原文
curl -sL https://raw.githubusercontent.com/wquguru/shisei/main/LICENSE-images
```

