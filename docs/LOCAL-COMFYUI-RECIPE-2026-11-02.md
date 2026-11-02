# 本地 ComfyUI 出图配方（对齐 anhao 的 Qwen 三图方案）

日期：2026-11-02

## 这份文档解决什么

我们把 ComfyUI 接进来了，但只做到「你能填一个工作流」。anhao 那边多做了一步——**直接给了一套装好模型就能出图的方案**：人像 + 服装 + 姿势三张图合成一张人物图。

这一份是那套方案的要点，以及怎么接到我们的占位符上。

**为什么要写**：光有 `{{prompt}}` `{{reference_image}}` `{{depth_image}}` 这些占位符，用户第一次打开还是不知道该填什么。装 ComfyUI 的人不需要教程教他装 ComfyUI，需要的是「用哪四个模型、哪几个参数不能动」。

## 需要的模型

| 用途 | 文件 | 目录 | 大小 |
| --- | --- | --- | --- |
| 扩散模型 | `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | `models/diffusion_models` 或 `models/unet` | 20.4 GB |
| 文本/视觉编码器 | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/text_encoders` | 9.4 GB |
| VAE | `qwen_image_vae.safetensors` | `models/vae` | 254 MB |
| 4 步加速 LoRA | `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras` | 850 MB |

ComfyUI **0.3.60 以上**，用内置节点就够，不需要装额外自定义节点（实测 0.43.0 可用）。

## 工作流结构

```
UNETLoader
  → LoraLoaderModelOnly (Lightning 4step)
  → ModelSamplingAuraFlow (shift=3)
  → CFGNorm
  → KSampler (4 步, cfg=1, euler/simple)
  → VAEDecode → SaveImage

三张图（人像/服装/姿势）
  → TextEncodeQwenImageEditPlus   （三路都进，提示词里按「图1/图2/图3」指代）
```

## 一条必须照做的经验

**只有人像和服装走 `ReferenceLatent` 做像素级参考，姿势图只做语义理解。**

如果把姿势线稿也当像素参考喂进去，生成结果会照搬人偶的关节球和分块线条——出来是个人体模型，不是人。

这条是踩过才知道的，不是理论推导。

## 接到我们的占位符上

从 ComfyUI 官方模板（或上面这套）导入 `.api.json` 到设置页之后，把这几个字段改成占位符：

| 原字段 | 改成 | 说明 |
| --- | --- | --- |
| `KSampler.seed` | `{{seed}}` | 必须是数字，不要把整体加引号 |
| `KSampler.steps` | `{{steps}}` | 高清档 28 / 标准档 20 由我们注入；4 步方案请写死 `4` |
| `CLIPTextEncode.text`（正向） | `{{prompt}}` | |
| `CLIPTextEncode.text`（反向） | `{{negative}}` | **cfg=1 时反向不生效**，「不要文字水印」得写进正向 |
| `EmptyLatentImage.width` / `.height` | `{{width}}` / `{{height}}` | 留数字类型 |
| `LoadImage.image`（人像） | `{{reference_image}}` | 第一张参考图 |
| `LoadImage.image`（服装） | `{{reference_image_2}}` | 第二张 |
| `LoadImage.image`（深度） | `{{depth_image}}` | 参考卡里的深度图 |

改完点「保存」，节点面板会把这些字段识别成占位符并排除在「可调参数」之外——它们由系统注入，手动改会被覆盖。

## 我们的差异（不是短板）

- **我们有深度图库 1,439 张**，anhao 的姿势库没有配套深度。深度图适合接 ControlNet Depth，控构图比控语义更准。
- **我们的选择面更宽**：姿势 569（288 组 × 5 视角）、服装 1,847（含二次元换装）、人像 1,499、深度 1,439、动漫衣装 1,320。

## 显存与速度（RTX 4070 SUPER 12 GB / 32 GB 内存实测，来自 anhao）

- 首次约 50 秒（含加载模型），之后每张 25–30 秒
- 20 GB 的 fp8 模型超过 12 GB 显存，ComfyUI 会部分卸载到内存，不用额外设置
- 8 GB 显卡：把输出像素量（`megapixels`）降到 0.6，并关掉其他吃显存的程序

## 已知限制

- 个别种子会在角落生成无意义的「标志」文字，换种子重生成即可。
- 服装名称与图不一致时以图为准，但不保证每次都对。

## 我们这边还缺的

- **没有打包这套 `.api.json`**。本机没有 ComfyUI、没有 torch、没有这四个模型（合计 31 GB），无法验证节点名和字段名写对没有。**塞一个没跑过的工作流进去比不给更糟**——用户导入后会得到一堆红色节点。
- 建议路径：先在 ComfyUI 里用官方模板出图成功，再按上面那张表替换占位符，导入我们的设置页。
- 如果之后能在装了 ComfyUI 的机器上验证，就把 `.api.json` 放进 `comfyui-vas-nodes/workflows/` 并加一条「填入推荐工作流」按钮。
