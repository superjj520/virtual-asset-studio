# R56 · 本地素材服务

素材已经落到本机之后，本机的其它程序不该再爬上游站点，而应该直接问这台机器。
这个服务把本地资产库**只读**地暴露成 HTTP 接口，同时提供一个出图入口。

代码：`electron/local-service.ts`（350 行）· 打包脚本：`scripts/build-service.mjs` · 验收：`scripts/verify-materials.mjs`。

## 起服务

```bash
npm run serve:materials          # 构建 + 启动，默认 http://127.0.0.1:7788
npm run verify:materials         # 在临时端口 7799 起一个实例跑 16 项断言，跑完自己关
```

改端口：`VAS_SERVICE_PORT=9000 npm run serve:materials` 或 `node --experimental-sqlite dist/service/materials.mjs --port=9000`。

> Node 22 的 `node:sqlite` 还挂在 `--experimental-sqlite` 后面，`serve:materials` 已经带上了。

## 七个端点

### `GET /health`

```bash
curl -s http://127.0.0.1:7788/health
```

```json
{
  "ok": true,
  "service": "vas-materials",
  "version": 1,
  "database": "…/virtual-asset-studio.sqlite",
  "assets": 10161,
  "cloudAssets": 10107,
  "comfyUrl": "http://127.0.0.1:8188"
}
```

### `GET /kinds`

各分类的真实条数。云端素材的 `kind` 存在 `metadata_json` 里，本地自建资产只有 `type`，
服务用 `coalesce(json_extract(metadata_json, '$.cloudReference.kind'), type)` 把两个口径合起来算。

实测：costume 1846 / pose 1722 / portrait 1499 / depth 1439 / anime-costume 1320 /
normal 944 / clay 944 / hair 306 / photo 89 / image 34 / reference_image 11 / character 5 / wardrobe 2。

### `GET /materials?kind=&q=&limit=&offset=`

| 参数 | 说明 |
|---|---|
| `kind` | 分类，见 `/kinds` |
| `q` | 搜索词，名称与 `metadata_json`（分类、标签）都查一遍 |
| `limit` | 默认 48，上限 500 |
| `offset` | 默认 0 |

```bash
curl -s "http://127.0.0.1:7788/materials?kind=normal&limit=2"
curl -s "http://127.0.0.1:7788/materials?q=%E7%AB%99%E5%A7%BF&limit=2"   # 站姿 → 370 条
```

```json
{
  "total": 944,
  "limit": 2,
  "offset": 0,
  "items": [
    {
      "id": "38728dd0-813f-4b3f-b196-08e876c9f962",
      "name": "后仰坐・单膝竖起・正面",
      "kind": "normal",
      "category": null,
      "sourceName": "Shisei（CC0）",
      "sourceUrl": "https://github.com/wquguru/shisei",
      "imageUrl": "/materials/38728dd0-.../image"
    }
  ]
}
```

### `GET /materials/:id`

详情，比列表多 `sha256` / `rightsStatus` / `confirmation` / `createdAt` / `managedPath` / `originalUrl` / `cloudItemId`。

### `GET /materials/:id/image?download=1`

按字节吐图片，`content-type` 是真实的 `image/webp` / `image/png`，带 `content-length`。
加 `download=1` 会带 `content-disposition` 附件头、文件名取素材名。

```bash
curl -s -o /tmp/pose.webp "http://127.0.0.1:7788/materials/<id>/image"
```

### `GET /random?kind=&count=`

随机取，`count` 默认 8、上限 100。做批量出图时用来抽参考图。

### `POST /generate`

复用 `ComfyUiImageProvider`——**不另写一套占位符规则**，否则会出现「应用里能出图、服务里出不了」的分叉。

```bash
curl -s -X POST http://127.0.0.1:7788/generate \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "同一成年东方女性，深蓝夜景，暖白主光与冷色轮廓光",
    "size": "1024x1536",
    "seed": 20261103,
    "references": ["<asset-id>"],
    "depthAssetId": "<asset-id>",
    "normalAssetId": "<asset-id>"
  }'
```

| 字段 | 说明 |
|---|---|
| `prompt` | 必填 |
| `size` | 只能是 `1024x1024` / `1024x1536` / `1536x1024` / `1536x1152` / `864x1536` / `1536x864` |
| `seed` | 可选 |
| `quality` | `high` 或 `medium` |
| `references` | 最多 6 个资产 id，会上传成 ComfyUI 的 `{{reference_image}}` |
| `depthAssetId` | 深度图，走 `{{depth_image}}` |
| `normalAssetId` | 法线图，走 `{{normal_image}}` |

返回 `{ file, bytes, url, used: { references, depth, normal } }`，图落在 `~/Library/Application Support/virtual-asset-studio/local-service-output/`，能通过 `GET /outputs/<name>` 取回。

ComfyUI 没配好时的报错是明确的：`{"error":"请先填写 ComfyUI 的 checkpoint 文件名，或提供自定义工作流。"}`

出图的 ComfyUI 连接参数走环境变量：

```bash
VAS_COMFY_URL=http://127.0.0.1:8188 \
VAS_COMFY_CHECKPOINT=sd_xl_base_1.0.safetensors \
VAS_COMFY_WORKFLOW=/path/to/workflow.api.json \
npm run serve:materials
```

## 安全边界

- 只监听 `127.0.0.1`，不改就是不出本机。
- 数据库 **`readOnly: true`** 打开，服务改不了资产库。
- `/outputs/<name>` 会 `resolve` 后检查 `target.startsWith(OUTPUT_DIRECTORY + sep)`，`../` 写法直接 400。
- 请求体上限 2 MB。

## 验收

```bash
npm run verify:materials
```

16 项：服务起得来、`/health` 报 ok 且资产数不是空库、`/kinds` 认得出法线且至少九类、
按 kind 列素材、列表项给得出图片地址、图片 200 且 `content-type` 是 `image/*`、
吐出来的真是图片字节（RIFF 头）、详情带 sha256、`/random` 能用、中文搜索命中 370 条、
路径穿越被挡、不存在素材 404、未知接口 404。

## 已知边界

- 只读：没有上传、删除、改元数据的接口。资产入库还是走应用里的「用这张」或整批下载。
- `/generate` 需要 ComfyUI 真的跑起来并且有 checkpoint；这台机器（16 GB 内存 + CPU）跑 Qwen-Image-Edit
  会卡在 swap 上，详见 `docs/R54-QWEN-EDIT-WORKFLOW.md`。
- 没有鉴权。因为它只听 `127.0.0.1`——如果哪天改成 `0.0.0.0`，必须先加 token，否则同一局域网谁都能拉素材。
