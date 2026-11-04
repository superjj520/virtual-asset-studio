# 虚拟资产 ComfyUI 节点包

十个从云端素材库直接取图的节点，加上一个参考板合成节点。装进 ComfyUI 之后，
在节点菜单里搜「虚拟资产」就能看到全部十个。

素材本身不随这个包分发，节点运行时按需从公开源拉取（清单内置、只有图片联网），
所以装完就能用，不需要先下载几百兆数据。

## 装上

ComfyUI 的自定义节点目录一般是 `<ComfyUI>/custom_nodes/`。三种装法挑一种：

**软链（开发时推荐，改了立即生效）**

```bash
ln -sfn /path/to/virtual-asset-studio/comfyui-vas-nodes \
       /path/to/ComfyUI/custom_nodes/comfyui-vas-nodes
```

**复制（一次性使用）**

```bash
cp -R comfyui-vas-nodes /path/to/ComfyUI/custom_nodes/
```

**ComfyUI Manager**：把整个 `comfyui-vas-nodes` 目录压成 zip，用 Manager 的
「Install from file」装。

装完重启 ComfyUI。启动日志里应该出现一行
`[comfyui-vas-nodes] 已加载 10 个节点`。没有这行就说明路径错了，
检查 `custom_nodes/comfyui-vas-nodes/__init__.py` 是否可读。

## 依赖

ComfyUI 自带的 torch / numpy / Pillow 就够了，正常不需要装东西。
`requirements.txt` 是空的，放它是为了让人知道「确实不用装」。

两个工作流例外：

- `workflows/qwen-image-edit-2509-gguf.json` 需要 `ComfyUI-GGUF` 节点包和
  `pip install gguf sentencepiece`
- `workflows/sd15-depth.json` / `sd15-normal.json` 需要 ControlNet 模型
  （见下面「工作流」）

## 十个节点

| 节点 | 显示名 | 取什么 |
|---|---|---|
| `VASPoseGallery` | 虚拟资产 · 姿势库 | 姿势线稿，1,439 张，可选是否换深度图 |
| `VASDepthGallery` | 虚拟资产 · 深度图库 | 与姿势库一一对应的深度图，1,439 张 |
| `VASNormalGallery` | 虚拟资产 · 法线图库 | 法线图，944 张 |
| `VASClayGallery` | 虚拟资产 · 黏土图库 | 素模渲染，944 张 |
| `VASPhotoGallery` | 虚拟资产 · 实拍图库 | 真人照片，89 张 |
| `VASCostumeGallery` | 虚拟资产 · 服装库 | 服装平铺图，1,407 张 |
| `VASPortraitGallery` | 虚拟资产 · 人像库 | 带发型的头像，1,499 张 |
| `VASAnimeCostumeGallery` | 虚拟资产 · 动漫衣装 | 动漫衣装，1,320 张 |
| `VASCharacterPack` | 虚拟资产 · 二次元换装库 | 二次元角色立绘，306 条 |
| `VASCharacterRecipe` | 虚拟资产 · 参考板合成 | 不吃库，把四路图拼成 2×2 参考板 |

前九个都有这些共同参数：

- `选择` — 从素材库里挑一张（下拉可搜，中文名）
- `尺寸模式` / `宽度` / `高度` — 原图尺寸、缩放到指定尺寸、裁切填满
- `水平镜像` — 左右翻转
- `刷新数据` — 重新拉一次远端清单

输出除了图，还带名称、中文描述、英文关键词，可以直接接进提示词。

`VASCharacterRecipe` 的输入是四个 IMAGE（身份必填，服装/姿态/深度可选）加
画风预设、画面质感、补充提示词，输出参考板图与中英提示词。

## 工作流

`workflows/` 下四份，都能直接在 ComfyUI 里 Load 打开：

| 文件 | 要什么模型 | 干什么 |
|---|---|---|
| `qwen-image-edit-2509.json` | Qwen-Image-Edit 全套（约 20 GB） | 官方口径的编辑流程 |
| `qwen-image-edit-2509-gguf.json` | 同上，GGUF 量化版（约 12 GB） | 显存不够时用 |
| `sd15-img2img.json` | SD1.5 | 参考图当身份，denoise 0.55 |
| `sd15-depth.json` | SD1.5 + `control_v11f1p_sd15_depth_fp16` | 深度图控构图 |
| `sd15-normal.json` | SD1.5 + `control_v11p_sd15_normalbae_fp16` | 法线图控表面朝向 |

ControlNet 模型放到 `<ComfyUI>/models/controlnet/`，可以从
`hf-mirror.com/comfyanonymous/ControlNet-v1-1_fp16_safetensors` 取，每个约 722 MB。

## 自检

不启动 ComfyUI 也能跑的静态检查（用 Python 3.11 即可）：

```bash
python3 comfyui-vas-nodes/selftest.py      # 九个源的取数与书名
python3 comfyui-vas-nodes/contract_test.py # 节点签名与返回个数
python3 comfyui-vas-nodes/parity_test.py   # 与参照实现的参数对照
python3 comfyui-vas-nodes/prompt_test.py   # 提示词拼装
python3 comfyui-vas-nodes/routes_test.py   # 三个 HTTP 路由
```

要真跑起来的检查（需要 ComfyUI 已在 8188 监听）：

```bash
python3 comfyui-vas-nodes/live_test.py     # 节点被加载、选项数、重名
python3 comfyui-vas-nodes/e2e_test.py      # 真出图（SD1.5）
python3 comfyui-vas-nodes/depth_test.py    # 姿势与深度图对得上
```

仓库根目录还有一条命令把上面这些都串起来：

```bash
npm run verify:nodes -- --online
```

## 数据从哪来

九个库分别来自四个公开站点，节点里只存清单不存图，图片按需取：

- 姿势 / 服装 / 人像 / 深度 / 动漫衣装 — `ai-pose-gallery.anhao.app` 与
  `ai-costume-anime-gallery.pages.dev`
- 法线 / 黏土 / 实拍 — `github.com/wquguru/shisei`（图像 CC0 1.0）
- 二次元换装 — 角色数据库上游

清单里内置了法线、黏土、实拍三类的完整索引（`normal-catalog.json`），
所以这三个库断网也能列出全部条目；其余六个要联网取清单。

## 许可

节点代码随本仓库。素材的权利归各自来源站点，本包只做索引与按需引用，
不转存、不再分发。要用在商业项目里请先确认各来源的授权条款。
