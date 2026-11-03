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
出图尺寸由 `EmptySD3LatentImage` 的宽高决定。

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
- 8 GB 显卡：把 `EmptySD3LatentImage` 的输出尺寸调小，或者降到 0.6 兆像素左右。

## 已知限制

- 个别种子会在角落生成无意义的「标志」文字，换种子重试最快。
- 服装名称与图片不一致时（比如名字写「牛仔」但图是粉色），模型以图片为准。
- 工作流里的「选择」默认值写的是生成这份 JSON 时图库的第一项。上游更新后名字可能变，
  导入时报 `value_not_in_list` 就是这条，换成下拉里现成的项即可。

## 验证到什么程度

`python comfyui-vas-nodes/live_test.py` 会在真的 ComfyUI 里跑参考板节点，
验证尺寸模式与镜像真的改变输出——那部分不需要模型权重，CPU 就能过。

这份工作流本身只验证到**图结构层面**：把它提交给真的 ComfyUI，返回的是
「模型文件不在磁盘上」（`unet_name ... not in []`），而不是节点不存在或类型不匹配。
也就是说接线是对的，缺的只是那几个文件。真要跑出图，得先下完 20 GB 的扩散模型。
