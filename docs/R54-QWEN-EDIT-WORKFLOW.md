# R54 · Qwen-Image-Edit 2509 三图合成工作流

这是给 `comfyui-vas-nodes` 配套的开箱工作流：从素材库里挑一张人像、一套服装、一个姿势，
合成成一张人物图。工作流文件在 `comfyui-vas-nodes/workflows/qwen-image-edit-2509.json`。

## 为什么要有这个文件

节点本身只解决「从图库里取图」，取到之后怎么送进模型是另一件事。之前用户装完节点，
面对的是一张空白画布：要自己接 UNET / CLIP / VAE、自己决定哪张图走语义、哪张图走像素参考。
anhao 那边是把这套接法写进文档的，我们这边缺这一层，装完节点仍然出不了图——
这就是「有节点」和「能出图」之间的差。

## 模型清单

全部来自 Comfy-Org 的官方仓库，放进 ComfyUI 对应的 `models/` 子目录：

| 用途 | 文件 | 目录 | 大小 |
| --- | --- | --- | --- |
| 扩散模型 | `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | `models/diffusion_models` 或 `models/unet` | 20.4 GB |
| 文本/视觉编码器 | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/text_encoders` | 9.4 GB |
| VAE | `qwen_image_vae.safetensors` | `models/vae` | 254 MB |
| 4 步加速 LoRA（2509 专用） | `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras` | 850 MB |

放好之后重启 ComfyUI，导入工作流，三个图库节点的「选择」换成你要的那条。

## 图是怎么接的

```
VASPortraitGallery ─┬─→ TextEncodeQwenImageEditPlus.image1 ─→ ReferenceLatent ─┐
                    ├─→ VAEEncode (像素级参考) ─────────────┘                  │
VASCostumeGallery ──┼─→ TextEncodeQwenImageEditPlus.image2 ─→ ReferenceLatent ─┤
                    └─→ VAEEncode (像素级参考) ────────────────────────────────┤
VASPoseGallery ───────→ TextEncodeQwenImageEditPlus.image3（只做语义理解）      ├→ KSampler
                                                                             │
UNETLoader → LoRA(Lightning) → ModelSamplingAuraFlow(shift=3) → CFGNorm ─────┘
```

三个要点：

**只有人像和服装走 `ReferenceLatent`（像素级参考），姿势图只进语义编码。**
如果把线稿人偶也当成像素参考，生成结果会照抄人偶的关节球和分块线条——
这是实测出来的，不是猜的。

**cfg=1 时反向提示词不生效。** Lightning LoRA 就是练在 cfg=1 上的，想让模型「不要文字、不要水印」，
这些要求得写进正向提示词，写进反向那一栏不会有任何作用。

**参考图尺寸不决定出图尺寸。** 三个图库节点的「宽度/高度」只影响送进模型前把参考图缩到多大；
出图尺寸由「输出尺寸」节点（22）决定。

**输出尺寸现在可调了。** 节点 22 是 `ResolutionSelector`：`aspect_ratio` + `megapixels`
+ `multiple` 算出宽高，再连进空 latent（16）的 `width`/`height`。默认
`2:3 (Portrait Photo)` / 1.5 兆像素 / 16 对齐，约 1000×1500。

之前这里是写死的 1024×1024。按 anhao 的文档，他们的输出是「按姿势图比例缩放到约 1 MP」
（1024×1536，2:3）。两个问题：一是人像九成是竖的，出方图会裁掉头顶或留白；二是
`aspect_ratio` 在他们那边只能人工从八档里挑，换一张横构图的姿势图就得手动改。
我们用同一个节点，但把**比例**也做成可在 App 高级区编辑的参数——八档照列，默认给竖版。

## 参考板分支

工作流末尾还挂了一个 `VASCharacterRecipe` + `PreviewImage`：
三张参考图同时喂给它，它会拼成一张 2×2 的对比板并预览。
这张板不会被送进模型——它的用处是让你一眼看到「模型实际看到的三张图长什么样」，
出问题时先看这张板，比看出图结果更容易定位是哪张参考图不对。

「跟随身份图」这个尺寸模式下，板子按人像的原始尺寸出，宽度/高度两个参数不参与。

## 显存与速度

（数字来自 anhao 在 RTX 4070 SUPER 12 GB / 32 GB 内存上的实测，我们这边没有同规格机器复现过，
这里照抄是为了给个量级参考，不当成我们的实测结论）

- 首次生成约 50 秒（含加载模型），之后每张 25–30 秒。
- 20 GB 的 fp8 模型超过 12 GB 显存，ComfyUI 会自动部分卸载到内存，不需要额外设置。
- 8 GB 显卡：把「输出尺寸」节点的 `megapixels` 降到 0.6，或者把 `aspect_ratio` 换成更小的档位。

## 已知限制

- 个别种子会在角落生成无意义的「标志」文字，换种子重试最快。
- 服装名称与图片不一致时（比如名字写「牛仔」但图是粉色），模型以图片为准。
- 工作流里的「选择」默认值写的是生成这份 JSON 时图库的第一项。上游更新后名字可能变，
  导入时报 `value_not_in_list` 就是这条，换成下拉里现成的项即可。

## 验证到什么程度

`python comfyui-vas-nodes/live_test.py` 会在真的 ComfyUI 里跑参考板节点，
验证尺寸模式与镜像真的改变输出——那部分不需要模型权重，CPU 就能过。

这份工作流本身起初只验证到**图结构层面**：把它提交给真的 ComfyUI，返回的是
「模型文件不在磁盘上」（`unet_name ... not in []`），而不是节点不存在或类型不匹配。
也就是说接线是对的，缺的只是那几个文件。

后来补了一支真正的端到端：`python comfyui-vas-nodes/e2e_test.py` 挂一个最小的
SD1.5 fp16（2 GB）跑 8 步 512×768，走 `CheckpointLoaderSimple → KSampler →
VAEDecode → VASCharacterRecipe → SaveImage`。**在本机 16 GB 内存、纯 CPU 下
72 秒跑完，两张图都出来了**——一张模型直出，一张经过参考板节点拼图。
checkpoint 不在时它自己打印「跳过」并返回 0，所以没装模型的机器上不会误报红。

它证明的是「模型 → 节点包 → 落盘」这条链路真的通，**不代表 Qwen-Image-Edit
本身能跑**：那个 20 GB fp8 在本机仍然跑不动（见下面「在这台机器上试过的结果」）。

## 没有 Lightning LoRA 时怎么办

`Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors`（850 MB）是社区产物，
不在 Comfy-Org 的官方仓库里——我试了 `lightx2v/Qwen-Image-Lightning` 和
`Comfy-Org/Qwen-Image-Edit_ComfyUI` 下的五种命名，全是 404。官方仓库只提供扩散模型、
编码器和 VAE 三件。

拿不到它就照下面改，用标准采样参数，慢一些但不影响能不能出图：

| 参数 | 有 Lightning LoRA | 没有 LoRA |
| --- | --- | --- |
| 节点 2 的 `strength_model` | 1.0 | 0（节点留着，强度归零等于不生效） |
| 节点 17 的 `steps` | 4 | 20 |
| 节点 17 的 `cfg` | 1.0 | 2.5 |

**cfg=1 时反向提示词不生效**这条只在前一种情况下成立；换成 cfg 2.5 之后反向词是有用的，
要「不要文字/水印」可以直接写进反向那一栏。

这张表按官方 Qwen-Image-Edit 的推荐值写，不是我方实测——见下一节的边界。

## 在这台机器上试过的结果（2026-11-03）

不是「理论上能跑」，是真下了模型、真提交了、真卡住了。记录在这里免得下一个人
再花三小时走一遍。

**机器**：Mac / Apple Silicon / 16 GB 内存 / 10 核 / CPU 模式（没有 CUDA）。

**模型**：`Qwen-Image-Edit-2509-Q4_K_M.gguf`（12.17 GB，`QuantStack` 的量化版）
+ `qwen_2.5_vl_7b_fp8_scaled.safetensors`（8.95 GB 编码器）+ `qwen_image_vae.safetensors`。
下载靠 `hf-mirror.com`（`huggingface.co` 直连超时），实测 6 MB/s。

**走到了哪一步**：

| 阶段 | 结果 |
| --- | --- |
| `/prompt` 提交 | 通过，零 node_errors（fp8 版报模型缺失，GGUF 版连这个都没有） |
| 编码器加载 | `loaded completely; 7910.28 MB`，成功 |
| 扩散模型加载 | `loaded completely; 12568.33 MB, full load: True`，成功 |
| 采样启动 | 进度条出现 `0/20`，说明图接通了 |
| **跑完第一步** | **没有** |

**卡在哪**：加载完 12.5 GB 扩散 + 7.9 GB 编码器之后，物理内存耗尽，
`vm.swapusage` 从 0 涨到 **11.9 GB / 13.3 GB**，ComfyUI 进程 RSS 只剩 2.3 GB
（模型大半被换到 swap）。采样进度条 28 分钟停在 `0/20`。

换成 `megapixels=0.35` + `steps=6`（比默认小 4 倍、步数少 3 倍）重试，
11.7 分钟仍停在 `0/6`，swap 再满。**不是慢，是每个 step 都在 swap 上抖。**

**结论**：16 GB 内存 + CPU 跑不动。要真出图至少得满足一条——24 GB 以上统一内存
（M 系列的 Pro/Max 可以），或者有独立显卡（anhao 那份文档用的是 RTX 4070 SUPER 12G，
他们说首次 50 秒、之后每张 25–30 秒，那是 GPU 的速度，跟这里不是一个量级）。

**没验证到的**：出图质量、身份一致性、参考图是否真的被「用对」。
工作流的接线正确性到此为止是**结构级**验证，不是效果级。
