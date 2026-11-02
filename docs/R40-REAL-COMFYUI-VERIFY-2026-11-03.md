# R40 在真的 ComfyUI 里跑一遍节点包

前几轮一直在说「本机没有 ComfyUI，节点包只有契约测试」。契约测试能证明「声明自洽」，证明不了「ComfyUI 认它」。这轮把这个洞补上了。

## 环境

- Python 3.11.15（Homebrew 的 3.15 太新，torch 没有对应 wheel；`~/.local/bin/python3.11` 可用）
- `python3.11 -m venv venv` → `pip install torch torchvision torchaudio` → **torch 2.15.0**
- ComfyUI master 用 `codeload` 的 tar.gz（12 MB，`git clone` 在同一个网络下拉了 3 分钟没动）
- `pip install -r ComfyUI/requirements.txt`
- 把仓库里的 `comfyui-vas-nodes/` 整个拷进 `ComfyUI/custom_nodes/`
- `python main.py --cpu --port 8199`，约 80 秒后 `To see the GUI go to: http://127.0.0.1:8199`

## 结果一：节点全被加载

`GET /object_info` 共 **1040** 个节点，其中 **7 个是我们的**，结构跟设计一致：

| 节点 | 显示名 | 必填 | 可选 | 输出 |
|---|---|---|---|---|
| `VASPoseGallery` | 虚拟资产 · 姿势库 | 选择 / 尺寸模式 / 宽度 / 高度 / 水平镜像 | 刷新数据 / 用深度图 | 图片 / 名称 / 提示词 |
| `VASDepthGallery` | 虚拟资产 · 深度图库 | 同上 | 刷新数据 | 图片 / 名称 / 提示词 |
| `VASCostumeGallery` | 虚拟资产 · 服装库 | 同上 | 刷新数据 | 图片 / 名称 / 中文描述 / **英文关键词** |
| `VASPortraitGallery` | 虚拟资产 · 人像库 | 同上 | 刷新数据 | 图片 / 名称 / 提示词 |
| `VASAnimeCostumeGallery` | 虚拟资产 · 动漫衣装 | 同上 | 刷新数据 | 图片 / 名称 / 中文描述 / **英文关键词** |
| `VASCharacterPack` | 虚拟资产 · 二次元换装库 | 类别 / 选择 | 刷新数据 | 图片 / 名称 / 提示词 |
| `VASCharacterRecipe` | 虚拟资产 · 参考板合成 | 身份 | 服装 / 姿态 / 深度 / 底色 / 画风预设 / 补充提示词 | 参考板 / 宽 / 高 / 中文提示词 / 英文提示词 |

分类统一是「虚拟资产」。姿势的「选择」枚举里是 **1439 条**中文条目（`P001 · S形站姿・胯部侧顶 · 正面` …）。

## 结果二：路由在真 ComfyUI 里注册成功

```
GET /vas_gallery/sites
{"sites":[{"site":"pose","label":"姿势","count":1439},{"site":"depth","label":"深度","count":1439},
{"site":"costume","label":"服装","count":1407},{"site":"portrait","label":"人像","count":1499},
{"site":"anime","label":"动漫衣装","count":1320},{"site":"chardb","label":"chardb","count":2347}]}

GET /vas_gallery/catalogue?site=pose&limit=2
{"site":"pose","total":1439,"matched":1439,"offset":0,"limit":2,"items":[
 {"id":"full_sexy_P001_front","label":"P001 · S形站姿・胯部侧顶 · 正面",
  "thumb":"/vas_gallery/thumb?site=pose&id=full_sexy_P001_front","tags":"全身单人・性感系 站姿 正面"}, ...]}
```

六个源的真实条数和客户端体检面板一致。

## 结果三：节点真的能出图

用 `/prompt` 提交四个工作流，全部 `status_str: success`：

| 验证点 | 参数 | 输出 |
|---|---|---|
| 基本出图 | 缩放到 512×768 | `ComfyUI_temp_ilxpo_00001_.png` **512×768** |
| 用深度图 | `用深度图: true`，原图尺寸 | `..._00002_.png` **300×400**（深度图原始尺寸，与姿势图不同） |
| 水平镜像 | `水平镜像: true` | `..._00003_.png` **900×1200**（原图尺寸） |
| 参考板合成 | 姿势图接进「身份」位，画风=电影写实，补充提示词 `backlit, afternoon sun` | `ComfyUI_temp_mgvtd_00001_.png` **1024×1024** |

深度图那张的尺寸变化是有效证据：说明「用深度图」确实换到了另一张图（深度库的图是 300×400），不是把姿势图原样吐出来。

## 复现步骤

```bash
~/.local/bin/python3.11 -m venv /tmp/comfyui-verify/venv
/tmp/comfyui-verify/venv/bin/pip install torch torchvision torchaudio
mkdir -p /tmp/comfyui-verify && cd /tmp/comfyui-verify
curl -sL https://codeload.github.com/comfyanonymous/ComfyUI/tar.gz/refs/heads/master -o comfyui.tar.gz
tar xzf comfyui.tar.gz && mv ComfyUI-master ComfyUI
./venv/bin/pip install -r ComfyUI/requirements.txt
cp -r <repo>/comfyui-vas-nodes ComfyUI/custom_nodes/
cd ComfyUI && ../venv/bin/python main.py --cpu --port 8199
```

## 诚实边界

- **没有 checkpoint，所以没跑 KSampler**。验证范围是「节点能加载 + 能下载图 + 能转张量 + 能拼板 + 能出 PNG」，不包含「模型出图质量」。
- 深度图的匹配关系（`用深度图` 走 `id` 对 `id`）在 `depth_test.py` 里是 1439/1439，这次真机又间接验证了一次（尺寸确实变了）。
- 前端选图弹窗（`web/gallery.js`）没有在浏览器里点过，只 `node --check` 过语法。
- 全部在 `/tmp` 下做的，没污染仓库；验证完已停掉 ComfyUI 进程。
