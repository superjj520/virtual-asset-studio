# 免费出图 / 出视频通道接入说明

本项目的图像与视频能力按「通道」组织：云端付费商（fal / Gemini / OpenAI / FLUX）保持原样，另加两条免费通道——本机 ComfyUI 与本机 Magpie 网关。免费通道**不替代**任何已有模型，只是并在同一份模型清单里，用户可以逐个挑。

## 一、本机 ComfyUI（出图主力，免费不限量）

- 地址：`http://127.0.0.1:8188`（设置 → 本机 ComfyUI 地址）
- 启动：`cd ~/ComfyUI-install/ComfyUI-master && nohup .venv/bin/python main.py --listen 127.0.0.1 --port 8188 --use-split-cross-attention > ~/ComfyUI-install/comfyui.log 2>&1 &`
- 模型目录：`~/ComfyUI-install/ComfyUI-master/models/checkpoints/`，放一个 `.safetensors` 就多一个可选出图模型。
- 清单怎么来：应用读取 ComfyUI 的 `/object_info/CheckpointLoaderSimple`，把每个 checkpoint 展开成一条模型；**装一个模型 = 多一条通道**，不需要改代码。
- 已装 4 个 checkpoint，对应清单里 4 条可选出图通道：
  | checkpoint | 类型 | 实测 |
  | --- | --- | --- |
  | `sd_xl_turbo_1.0_fp16` | SDXL-Turbo | 768×768 / 4 步，首次 184 秒（含 6.5 GB 载入），之后约 1 秒一张 |
  | `sd_xl_base_1.0` | SDXL base | 768×768 / 12 步 / cfg 7 / dpmpp_2m+karras，63 秒 |
  | `animagine-xl-3.1` | SDXL 动漫 | 与 base 同参数，适合角色立绘 |
  | `Counterfeit-V2.5_fp16` | SD1.5 动漫 | 512×512 / 4 步，也是动画引擎的默认底模 |
- 采样器注意：MPS 上 `dpmpp_sde + karras` 会卡在 0%；Turbo / Lightning 类用 `euler + normal`，SDXL base 用 `dpmpp_2m + karras`。
- 内存红线：16 GB 统一内存下，768×512×24 帧或 1024+ 分辨率会触发 `Not enough memory, use lower resolution (max approx. 1088x1088)`，出图请留在 768×768。

## 二、本机 Magpie 网关（云端免费兜底）

- 地址：`http://127.0.0.1:3425/v1`（设置 → Magpie 免费池，填地址即可，不填密钥）
- 文本走 `group/free-token-pool`（AMD Radeon Cloud 免费池，每天 09:05 自动重建）
- 出图走 `freeimg/flux`（Pollinations 的 Sana，免费但每 IP 45 秒一张、约 768px、带角标），只适合临时补图。

## 三、视频通道

- 云端：OpenAI Sora（`sora-2` / `sora-2-pro`），需要付费密钥。
- 本机 ComfyUI 有两个引擎，用设置项 `comfyui_video_mode` 切换（`animate` 默认 / `wan`）：
  - **animate（默认，实测可用）**：SD1.5 checkpoint + `AnimateDiff-Lightning 4step` motion module，512×512、16 帧、4 步、8 fps → **约 66 秒出一条 2 秒 mp4**；竖版 512×768。底模由 `comfyui_video_ckpt` 指定（默认 `Counterfeit-V2.5_fp16`），motion 由 `comfyui_video_motion` 指定。
  - **wan（本机跑不动）**：Wan2.1 1.3B + `umt5_xxl_fp8` + `wan_2.1_vae`，需要 T5 6.4 GB + UNet 2.7 GB 常驻，16 GB 机器 swap 用满、停在 0/20。
- 画幅与帧数硬约束：AnimateDiff/SD1.5 只认 512 训练分辨率，给 640×384 这类非原生比例会直接出抽象色带；帧数 8 fps × 秒数，上限 16 帧（再多就 OOM）。
- 参考图暂不支持（图生视频），provider 会直接返回「本机文生视频暂不支持参考图」。
- 质量提示：Counterfeit 是动漫底模，写实题材会偏软；要更好的画面换写实系 SD1.5 checkpoint（改 `comfyui_video_ckpt` 即可，无需改代码）。

## 四、模型清单与画幅

- 清单文件：`src/shared/generation-models.ts`；ComfyUI 的 checkpoint 由 `withComfyCheckpoints()` 动态展开，`ProviderStatus.comfyui.checkpoints` 提供数据，`setComfyCheckpoints()` 在渲染进程缓存。
- 同一家多个模型靠 `providerModel` 透传：ComfyUI 用 checkpoint 文件名、Magpie 用网关模型 id（`electron/runtime.ts` 的 `imageProviderFor()`）。
- 画幅：ComfyUI 走六档真实尺寸；Magpie 的 Pollinations 只能 1:1 / 2:3 / 3:2 附近，超出的比例会被上游裁切。

## 五、验收方式

- 单元测试：`npx vitest run electron/services/providers/comfyui-video-provider.test.ts electron/services/providers/magpie-provider.test.ts src/shared/generation-models.test.ts`
- 类型检查：`npx tsc -b` + `npx tsc -p tsconfig.electron.json --noEmit`
- 打包前构建：`npm run build`
- **本地端口测试坑**：环境里 `http_proxy/https_proxy/ALL_PROXY` 指向 `127.0.0.1:10903`，vitest 的 jsdom 环境会让 `fetch` 走代理，导致打 `127.0.0.1:8188` 直接挂到 30 秒超时。跑涉及本机服务的测试要剥掉代理：`env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NODE_USE_ENV_PROXY=0 npx vitest run <file>`
- 真实出片证据：经 `ComfyUiVideoProvider`（animate 引擎）跑通一次完整链路，420370 bytes / 96s，输出 `/tmp/anim-e2e.mp4`（640×384 实验档，改回 512 后冒烟 `/tmp/anim-probe.mp4`）。
- 真机出图证据：ComfyUI 直连与经适配器两条路径都跑过，样例图见 `~/.config/free-token-magpie/` 下的冒烟输出。
