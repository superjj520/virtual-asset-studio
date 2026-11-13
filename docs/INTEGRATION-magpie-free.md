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
  - **animate（默认，实测可用）**：SD1.5 checkpoint + `AnimateDiff-Lightning 4step` motion module，512×512、16 帧、4 步、8 fps → **约 66 秒出一条 2 秒 mp4**；竖版 512×768 实测 **330 秒**（面积 1.5 倍但内存压力大，慢 5 倍，值得等再选）。底模由 `comfyui_video_ckpt` 指定（默认 `Counterfeit-V2.5_fp16`），motion 由 `comfyui_video_motion` 指定。
  - 设置页「本机视频」面板可直接切引擎、填底模与 motion module，不需要改数据库。
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

## 图生视频（参考图 → 2 秒短片）

`ComfyUiVideoProvider` 在 animate 引擎下，只要给了 `referencePath` 就自动走图生视频，不再拒绝参考图：

```
LoadImage → ImageScale(lanczos, crop=center, 512×512 / 512×768)
→ VAEEncode → RepeatLatentBatch(=帧数) → KSampler(denoise 0.55, 4 步, cfg 1.5, euler/normal)
→ VAEDecode → VHS_VideoCombine(h264 mp4, 8fps)
```

- `denoise 0.55` 是实测折中：<0.4 只看到呼吸感，>0.7 会开始重画主体；
- 首帧就是你的参考图（等比缩放+居中裁切），所以角色/产品不会“换个人”；
- 参考图先 `POST /upload/image` 传进 ComfyUI，再以文件名进 `LoadImage`；
- Wan2.1 只有文生视频权重，选 wan 引擎再给参考图会明确返回「请切回 AnimateDiff Lightning」。

实测（512×512 / 16 帧 / 2 秒，SDXL 出的陶瓷杯当首帧）：`434 秒`，133406 bytes，h264 512×512 8fps，首帧与原图一致、第 10 帧只有高光与阴影的细微变化 —— 换机器或内存宽松时会快得多（同参数文生视频曾是 96 秒，这次慢是因为 swap 已用 7.1G/9.2G）。

### 写实底模（视频/图生视频推荐）

默认的 `Counterfeit-V2.5` 是动漫底模，出产品片会发软。换成写实的 SD1.5 单文件底模后差别很大：

| checkpoint | 来源 | 体积 | 文生视频 512×512×16 帧 | 图生视频 12 帧 |
| --- | --- | --- | --- | --- |
| `Counterfeit-V2.5_fp16.safetensors` | `AI-ModelScope/Counterfeit-V2.5` | 2.13 GB | 66–422 s，风格偏动漫 | 434 s（swap 吃满时） |
| `realisticVisionV51_v51VAE.safetensors` | `AI-ModelScope/realisticVisionV51_v51VAE` | 2.0 GB | 353 s，写实台灯+木纹 | **94 s**，陶瓷杯釉面真实 |

下载直链（ModelScope，本机 21 MB/s，约 2.5 分钟）：

```bash
cd ~/ComfyUI-install/ComfyUI-master/models/checkpoints
curl -sL --noproxy '*' -o realisticVisionV51_v51VAE.safetensors \
  "https://modelscope.cn/models/AI-ModelScope/realisticVisionV51_v51VAE/resolve/master/realisticVisionV51_v51VAE.safetensors"
```

ComfyUI 会自动扫到新文件（不用重启），`object_info/CheckpointLoaderSimple` 里立刻出现。设置库 `comfyui_video_ckpt` 已指向它。

> 找写实底模时的现实：`AI-ModelScope/realistic-vision-v51` 只有 diffusers 分文件夹格式（ComfyUI 单文件加载器用不了），`ChilloutMix`/`DreamShaper`/`epiCRealism`/`majicmixRealistic` 等十多个常见仓名全部 404，HuggingFace 直连超时。可用的就是 `realisticVisionV51_v51VAE` 这一个。

### 底模在界面里怎么标

设置页的模型清单会按文件名自动加后缀，省得对着五个文件名猜：

| 文件名关键字 | 后缀 | 说明 |
| --- | --- | --- |
| `*turbo*` | 1 秒出图 | 4 步，768×768 实测 1 秒，快速试构图 |
| `sd_xl_base*` | 高质量 | 12 步，768×768 实测 63 秒，交付图用它 |
| `realistic*vision*` | 写实 | SD1.5 写实底模，产品片/人像不发软，视频也用它 |
| `counterfeit` / `animagine` / `anime` / `mistoon` | 动漫 | 二次元角色向，写实题材会发软 |

默认值现状：`comfyui_checkpoint = sd_xl_base_1.0.safetensors`（出图求质），`comfyui_video_ckpt = realisticVisionV51_v51VAE.safetensors`（写实），`comfyui_video_mode = animate`。

### 内存预检与 OOM 兜底（`ComfyUiVideoProvider`）

出片前先打一次 `GET /system_stats`，读 `system.ram_free`：

- **只在低于 2 GB 硬地板时拦人**，报「现在只剩约 N GB、这条 M 帧大约要 K GB」并给出三条处置（关掉别的出片 / 降到 2 秒内 / 换 turbo 底模）；
- 为什么不用估算量直接拦：ComfyUI 自己会缓存模型，`ram_free` 低经常是因为模型已经驻留，这时反而更快。实测 512×512×16 帧在剩 3–5 GB 时都能跑完，只有剩 1 GB 那次真炸（ComfyUI 报 `Need 1.3GB free, Have 1.0GB`）。
- 预检接口拿不到（老版本）就直接放行，不因为预检本身挡掉出片。

真炸了的时候：`getVideo` 读到 `Not enough memory / OutOfMemory` 会 `POST /free {unload_models:true, free_memory:true}` 让 ComfyUI 吐掉缓存，再把英文报错翻成中文可照做的提示，避免下一次接着崩。

实测（2026-11-03，`ram_free` 3.0 GB 时）：12 帧写实底模 i2v **131 秒完成**，143235 bytes，画面是釉面陶瓷杯 + 木纹桌面。

## ComfyUI 是常驻服务，不是手动起的进程

`~/Library/LaunchAgents/ai.magpie.comfyui.plist`：

```xml
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Interactive</string>
<key>WorkingDirectory</key><string>/Users/superjj/ComfyUI-install/ComfyUI-master</string>
```

- `KeepAlive` = 崩了自己起来（实测 `kill -9` 后 45 秒内换新 PID、1218 个节点回来、`Device: mps` 不变）；
- `ProcessType: Interactive` 让 launchd 别把它当后台任务压优先级；
- 日志仍写 `~/ComfyUI-install/comfyui.log`。

常用命令：

```bash
launchctl list | grep ai.magpie.comfyui          # 看有没有在跑
launchctl kickstart -k gui/$(id -u)/ai.magpie.comfyui   # 重启（也会清掉卡住的队列）
curl -s http://127.0.0.1:8188/system_stats | head -c 200
```

`manage.sh doctor` 里也加了自愈：8188 不通就 `kickstart` 等 60 秒再复查，实测 5 秒拉起。

### 性能由系统内存决定，不是服务本身

服务重启后第一次出图要重新载入 4.9 GB 权重。实测同一张 768×768 / 4 步 turbo：

| 系统状态 | 耗时 |
| --- | --- |
| swap 空闲（0–2 GB） | 1 秒（模型已驻留） |
| swap 用掉 12.8 GB / 13.3 GB | 127 秒 |
| swap 打满、队列卡在 50% | 不出图 |

所以「本机 ComfyUI 变慢了」先看 `sysctl vm.swapusage`，而不是怀疑服务。要快的唯一办法是让它独占内存。

### 任务卡住不用重启服务

两条路，按在哪一层决定：

| 场景 | 会自动做什么 | 你要做什么 |
| --- | --- | --- |
| 应用里出图超时（默认 10 分钟） | 中断当前任务 + `/free` 卸载模型释放缓存，然后报「生成超时…先看 sysctl vm.swapusage」 | 降尺寸或换 `sd_xl_turbo` 再点一次 |
| 应用里出片超时（默认 20 分钟） | 同上，报「等了 20 分钟还没出片，已中断并释放缓存」 | 同上，或把帧数降到 8–12 |
| 任务在 ComfyUI 里凭空消失（服务重启过） | 连续 2 次查不到就报「这条任务在 ComfyUI 里已经不见了…重新生成一次即可」 | 直接重试 |
| 队列被别人（我、脚本）塞满 | 不会自动清 | `./manage.sh comfy-clean` |

`comfy-clean` 做三件事：`POST /interrupt`（中断正在跑的）、`POST /queue {"clear":true}`（清空排队的——这一步必须显式做，`/interrupt` 管不到）、`POST /free {"unload_models":true,"free_memory":true}`（卸载模型把内存还给系统）。实测 `running/pending 0 2 → 0 0`。

> 应用内部的超时清理**故意不清排队队列**：批量生成时超时的是其中一条，把兄弟任务一起清掉更糟。要清整队就手动跑 `comfy-clean`。

### 报错都翻成人话

| 哪条路 | 原始信号 | 现在显示 |
| --- | --- | --- |
| Magpie 网关 | HTTP 401/403 | Magpie 拒绝了这次请求：检查设置页里「Magpie 免费池」填的是不是网关地址 `http://127.0.0.1:3425/v1`（本机网关不校验 key） |
| Magpie 网关 | HTTP 429 | 池里所有能用的模型此刻都在限流（并发被占满）。等几十秒，或把深推理模型留给长任务 |
| Magpie 网关 | HTTP 5xx | 上游平台或网关内部出错，通常是那家免费平台在抖动。重试一次，仍失败就换组里的下一条路由 |
| Magpie 网关 | 5 分钟无响应（`timeoutMs` 可调） | Magpie 网关 5 分钟没有回应：池里这条路由卡住了（推理模型常见） |
| Magpie 网关 | 连不上 | 连不上 Magpie 网关：确认 Magpie 正在运行（菜单栏图标） |
| Magpie 出图 | `knows no model … to draw with` | 免费池里还没有会出图的平台：确认 `curl http://127.0.0.1:3436/healthz`，再 `magpie provider add … id=freeimg` |
| ComfyUI | checkpoint 不存在 / OOM / 连不上 | 分别给「改成清单里的文件名」「降到 512–768 或换 turbo」「`launchctl kickstart …`」 |

底层 `fetchProvider` 把超时和连不上统一成两句中文，`MagpieProvider` 按它分流——所以用户看到的是「该做什么」，不是 `AbortError`。

### `doctor` 现在也看机器还能不能干活

```
! 内存吃紧：swap 已用 7186.88M / 8192.00M（87%），空闲约 144M —— 出图会慢几十倍甚至卡住
!   先关掉不用的应用，再跑 ./manage.sh comfy-clean 把 ComfyUI 占的内存还回去
```

阈值取 swap 用到 70%。实测 `comfy-clean` 之后 swap 从 7146M 退到有 1045M 余量、空闲内存 65M 变 1045M；但整机 swap 仍高说明压力来自别的应用，不是 ComfyUI——这行提示就是为了区分这两件事。

### 一个曾经把整条视频路由堵死的 bug

`providerConnections()` 里 `comfyui` 的 `capabilities` 原本只写了 `["image"]`。UI 的下拉是按能力过滤的（`item.capabilities.includes(capability)`），所以**视频路由下拉里根本不会出现 ComfyUI** —— 后端能出片，但用户在界面上选不到它，只能看到要付费的 OpenAI。

修了两处：

```ts
{ id: "comfyui", configured: comfyui.isConfigured(), capabilities: ["image", "video"] }
video: ["comfyui", "openai"]   // 本机免费引擎排前面，付费 sora 排后面
```

测试锁住：配好 `comfyui_base_url` 后，`settings:provider-status` 返回的 `routes.video` 必须是 `"comfyui"`，且 `comfyui.capabilities` 同时含 `image` 与 `video`。
