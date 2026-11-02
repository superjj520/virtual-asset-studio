# 免费出图 / 出视频通道接入说明

本项目的图像与视频能力按「通道」组织：云端付费商（fal / Gemini / OpenAI / FLUX）保持原样，另加两条免费通道——本机 ComfyUI 与本机 Magpie 网关。免费通道**不替代**任何已有模型，只是并在同一份模型清单里，用户可以逐个挑。

## 一、本机 ComfyUI（出图主力，免费不限量）

- 地址：`http://127.0.0.1:8188`（设置 → 本机 ComfyUI 地址）
- 启动：`cd ~/ComfyUI-install/ComfyUI-master && nohup .venv/bin/python main.py --listen 127.0.0.1 --port 8188 --use-split-cross-attention > ~/ComfyUI-install/comfyui.log 2>&1 &`
- 模型目录：`~/ComfyUI-install/ComfyUI-master/models/checkpoints/`，放一个 `.safetensors` 就多一个可选出图模型。
- 清单怎么来：应用读取 ComfyUI 的 `/object_info/CheckpointLoaderSimple`，把每个 checkpoint 展开成一条模型；**装一个模型 = 多一条通道**，不需要改代码。
- 已装：`sd_xl_turbo_1.0_fp16.safetensors`（768×768 / 4 步，首次 184 秒含 6.5 GB 模型加载，之后约 1 秒一张）。
- 采样器注意：MPS 上 `dpmpp_sde + karras` 会卡在 0%，内置工作流用 `euler + normal`。

## 二、本机 Magpie 网关（云端免费兜底）

- 地址：`http://127.0.0.1:3425/v1`（设置 → Magpie 免费池，填地址即可，不填密钥）
- 文本走 `group/free-token-pool`（AMD Radeon Cloud 免费池，每天 09:05 自动重建）
- 出图走 `freeimg/flux`（Pollinations 的 Sana，免费但每 IP 45 秒一张、约 768px、带角标），只适合临时补图。

## 三、视频通道

- 云端：OpenAI Sora（`sora-2` / `sora-2-pro`），需要付费密钥。
- 本机：ComfyUI + Wan2.1 文生视频（`wan2.1_t2v_1.3B_fp16` + `umt5_xxl_fp8` + `wan_2.1_vae`），已接线到「视频」路由，模型文件齐全、代码与单元测试齐备。
- **16 GB 统一内存的实测结论**：Wan 1.3B 需要同时驻留 T5 文本编码器 6.4 GB 与 UNet 2.7 GB，跑到采样阶段时系统 swap 用满 12.5 GB、进度停在 0/20，不具备可用性。要在本机真出片，必须换更省内存的路线：
  1. 更低分辨率 + 更短帧数（256×256、17 帧、8 步）仍会触发大量 swap，只适合调试工作流，不适合出片；
  2. 装 AnimateDiff + SD1.5（内存约 3–4 GB）做 16 帧短视频，是目前 16 GB 机器最现实的本地方案；
  3. 或者给一家带视频的云端密钥（智谱 CogVideoX-Flash 有免费额度）。

## 四、模型清单与画幅

- 清单文件：`src/shared/generation-models.ts`；ComfyUI 的 checkpoint 由 `withComfyCheckpoints()` 动态展开，`ProviderStatus.comfyui.checkpoints` 提供数据，`setComfyCheckpoints()` 在渲染进程缓存。
- 同一家多个模型靠 `providerModel` 透传：ComfyUI 用 checkpoint 文件名、Magpie 用网关模型 id（`electron/runtime.ts` 的 `imageProviderFor()`）。
- 画幅：ComfyUI 走六档真实尺寸；Magpie 的 Pollinations 只能 1:1 / 2:3 / 3:2 附近，超出的比例会被上游裁切。

## 五、验收方式

- 单元测试：`npx vitest run electron/services/providers/comfyui-video-provider.test.ts electron/services/providers/magpie-provider.test.ts src/shared/generation-models.test.ts`
- 类型检查：`npx tsc -b` + `npx tsc -p tsconfig.electron.json --noEmit`
- 打包前构建：`npm run build`
- 真机出图证据：ComfyUI 直连与经适配器两条路径都跑过，样例图见 `~/.config/free-token-magpie/` 下的冒烟输出。
