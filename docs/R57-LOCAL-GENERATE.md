# 通过本地服务出图（含参考图）

用户的原话是「后续我可以通过本地服务来调用生产新的图片」。这条链路的每一段
（HTTP → ComfyUI → 模型 → PNG 回传）都在 `npm run verify:generate` 里跑真的。

## 启动

```bash
npm run build:service
VAS_COMFY_CHECKPOINT=sd15-fp16.safetensors npm run serve:materials
```

默认端口 7788，`/health` 里会回显它连的 ComfyUI 地址。

## 最小一次调用

```bash
curl -s -X POST http://127.0.0.1:7788/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"portrait of a young woman, natural window light","size":"512x768","quality":"draft"}'
```

返回：

```json
{
  "file": "~/Library/Application Support/virtual-asset-studio/local-service-output/1793808392173-364448.png",
  "bytes": 526376,
  "url": "/outputs/1793808392173-364448.png",
  "used": { "references": 0, "depth": false, "normal": false }
}
```

`used` 是给自己看的账：**说用了几张参考图就必须真的用了几张**。

## 画幅与质量档

| size | 说明 |
|---|---|
| `512x512` / `512x768` / `768x512` | 纯 CPU 上一分钟出头，调构图用 |
| `1024x1024` | 纯 CPU 要八分钟以上，出错排查时别用这档 |

| quality | 步数 | 用途 |
|---|---|---|
| `draft` | 8 | 试构图、试提示词 |
| `medium` | 20 | 默认 |
| `high` | 28 | 定稿 |

## 带参考图（身份锁定）

内置模板是纯文生图，**没有 `{{reference_image}}` 占位符**。传 `references` 会直接报错：

```
当前 ComfyUI 工作流没有 {{reference_image}} 占位符，参考图会被忽略。
请加一个 LoadImage 节点，把它的 image 写成 {{reference_image}}。
```

这不是坏了，是**宁可报错也不让用户以为身份锁上了**。

要真用参考图，给一个带占位符的工作流。仓库里有现成的 `comfyui-vas-nodes/workflows/sd15-img2img.json`：

```bash
VAS_COMFY_WORKFLOW="$(cat comfyui-vas-nodes/workflows/sd15-img2img.json)" \
VAS_COMFY_CHECKPOINT=sd15-fp16.safetensors npm run serve:materials
```

然后：

```bash
# 先找一张库里的人像
ID=$(curl -s 'http://127.0.0.1:7788/materials?kind=portrait&limit=1' | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')

curl -s -X POST http://127.0.0.1:7788/generate \
  -H 'Content-Type: application/json' \
  -d "{\"prompt\":\"same person, wearing a dark coat, city street at night\",
       \"size\":\"512x768\",\"quality\":\"draft\",\"references\":[\"$ID\"]}"
```

`used.references` 会是 `1`，而且出图与纯文生图**不是同一张脸之外的东西**——
`sd15-img2img.json` 用 `ImageScale → VAEEncode → KSampler(denoise 0.55)`，
denoise 0.55 保留人物、换掉场景与服装。实测输入「室内浅色上衣微笑」→ 输出
「同一张脸 + 深色外套 + 夜街暖光虚化」。

## 带深度图（ControlNet）

素材库里有 1,439 张深度图，它们能真的控制构图——不是把深度图当普通参考图贴进去。

```bash
# 挑一张深度图
DEPTH=$(curl -s 'http://127.0.0.1:7788/materials?kind=depth&limit=1' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")

curl -s -X POST http://127.0.0.1:7788/generate \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"a woman standing, soft studio light\",\"size\":\"512x768\",\"depthAssetId\":\"$DEPTH\"}"
```

要跑这条，ComfyUI 得有两样东西：

| 东西 | 放哪 | 大小 |
|---|---|---|
| 深度模型 | `models/controlnet/control_v11f1p_sd15_depth_fp16.safetensors` | 722 MB |
| 工作流 | 启动时 `VAS_COMFY_WORKFLOW=$(cat comfyui-vas-nodes/workflows/sd15-depth.json)` | — |

模型从 `hf-mirror.com/comfyanonymous/ControlNet-v1-1_fp16_safetensors` 取。缺了它服务不会假装成功——`verify-generate` 里那一段会整段跳过并打印来源。

实测：深度图「背靠・双膝大幅打开・侧面」驱动出同姿势的淡彩人像，2 分 8 秒，`used.depth: true`。**构图真的跟着深度图走**，不是只把图传过去。

法线图（`normalAssetId`）走的是同一条路，但它需要 ControlNet **Normal** 模型（不是 Depth 模型），本机没装，所以那条还没实测过。

## 带法线图（ControlNet）

深度图管的是「前后远近」，法线图管的是「表面朝向」——同一个姿势，深度图给的是轮廓体积，法线图给的是每个面的转折。两个模型不通用，别混。

模型放 `models/controlnet/control_v11p_sd15_normalbae_fp16.safetensors`（722 MB，同一仓库 `comfyanonymous/ControlNet-v1-1_fp16_safetensors`），工作流用 `comfyui-vas-nodes/workflows/sd15-normal.json`：结构与深度那份一样，只是 `control_net_name` 换成 normalbae、占位符换成 `{{normal_image}}`。

```bash
VAS_COMFY_CHECKPOINT=sd15-fp16.safetensors \
VAS_COMFY_WORKFLOW="$(cat comfyui-vas-nodes/workflows/sd15-normal.json)" \
npm run serve:materials
```

```bash
curl -s -X POST http://127.0.0.1:7788/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a woman standing, soft studio light","size":"512x768","quality":"draft","normalAssetId":"<法线图资产 id>"}'
```

返回里 `used.normal: true`。实测用库里的法线图「背向坐在对方两膝间 · 正面」驱动，1 分 50 秒，出图姿势与两人叠坐的位置一致，风格变成古典写实。

同一台机器上四条通道的实测耗时（512×768、draft 8 步、纯 CPU）参考：纯文生图约 70 秒、参考图约 60 秒、深度图约 2 分 8 秒、法线图约 1 分 50 秒。ControlNet 那两条比文生图慢一倍，因为要多算一遍条件分支。

## 工作流的占位符

| 占位符 | 填什么 |
|---|---|
| `{{prompt}}` / `{{negative}}` | 提示词 |
| `{{seed}}` / `{{steps}}` | 种子与步数（由 quality 决定） |
| `{{width}}` / `{{height}}` | 画幅 |
| `{{checkpoint}}` | 模型文件名 |
| `{{reference_image}}` | 第一张参考图；之后 `{{reference_image_1}}`… |
| `{{depth_image}}` / `{{normal_image}}` | 深度图 / 法线图 |

**JSON 里不要放 `_comment` 之类的非节点键**——ComfyUI 会把它们当节点读，
报 `AttributeError: 'str' object has no attribute 'get'`，表现得像工作流坏了。

## 验收

```bash
VAS_COMFY_CHECKPOINT=sd15-fp16.safetensors npm run verify:generate
```

17 项：服务起得来 · ComfyUI 地址对得上 · 出图成功 · 不是空壳 · 给了可取回地址 ·
文件落盘 · 没参考图时如实报 0 · 地址能取回图 · content-type 是图 · PNG 头 ·
尺寸对得上 · 库里有可当参考的人像 · 带参考图能出图 · 如实报 1 张 ·
不是空壳 · 也是 PNG · 与纯文生图不同。

ComfyUI 没起或没装 checkpoint 时自己跳过返回 0。

**种子每次随机**：ComfyUI 对同工作流同参数有缓存，复用旧种子会一秒返回旧图，
看着像跑通了其实没采样。要固定用 `VAS_VERIFY_SEED=20261104`。

## 已知边界

- 16 GB 内存的机器上，Qwen-Image-Edit（最小量化 Q2_K 也要 15.3 GB 常驻）跑不动，
  会在 swap 上抖死。SD1.5 是这台机器上能真出图的上限。
- `/generate` 不排队：同时发两个请求会让 ComfyUI 串行处理，第二个等第一个跑完。
