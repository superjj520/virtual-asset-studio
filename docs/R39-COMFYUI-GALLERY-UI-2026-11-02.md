# R39 ComfyUI 侧图库选图器

日期：2026-11-02

## 补的是什么

anhao 的插件有一个「中文弹窗选图器」——4,345 条记录，点开弹窗看缩略图挑。我们之前只有节点的「选择」下拉，里面是 1,439 条 `P001 · S形站姿・胯部侧顶 · 正面`，**看不到图，只能靠名字猜**。

这轮补上两部分：

**后端路由**（`comfyui-vas-nodes/routes.py`）

```
GET /vas_gallery/sites                      六个来源的元信息
GET /vas_gallery/catalogue?site=&q=&offset=&limit=   条目列表
GET /vas_gallery/thumb?site=&id=            缩略图字节流
```

**前端弹窗**（`comfyui-vas-nodes/web/gallery.js`，`WEB_DIRECTORY = "./web"`）

六个节点各挂一个「浏览图库」按钮，点开是搜索框 + 来源切换 + 分页网格，点一张图就把名字写回「选择」下拉。

## 三个必须这么做的原因

### 1. 缩略图不能直接给前端的 `<img>`

远程地址是 `https://ai-pose-gallery.anhao.app/thumbs/...`。浏览器直接请求会被跨域挡掉（对方也没开 CORS），所以 `catalogue` 返回的 `thumb` 字段是**本服务的代理地址** `/vas_gallery/thumb?site=pose&id=xxx`，由 aiohttp 转一手。

`routes_test.py` 里有一条断言就是防这个：`"anhao.app" not in page["items"][0]["thumb"]`——如果哪天有人图省事直接返回远程地址，这条会红。

### 2. 这个代理不能变成任意 URL 下载器

`/vas_gallery/thumb` 是对 ComfyUI 前端开放的接口。如果它接受任意 `url` 参数，任何能访问 ComfyUI 的人都能拿它当跳板。所以三道校验：

- 主机白名单（`ALLOWED_HOSTS`，五个域名）
- `content-type` 必须是 `image/*`
- 12MB 上限

`routes_test.py` 验了三种绕过尝试都被拒：未知主机、`file://` 协议、`evil.com` 伪装成 `ai-pose-gallery.anhao.app.evil.com`。

### 3. 六个来源的数据结构完全不同

| 来源 | 数据结构 |
|---|---|
| pose / costume / portrait | 三份 JSON |
| depth / anime | 首页内联 `const D=[...]` |
| chardb | `window.CHARDB`，按 set 分四组 |

前端不该知道这些差异。`routes.py` 统一成 `{ id, label, thumb, tags }` 四个字段，`site_catalogue()` 按来源分流。

## 验证

```
$ python3 routes_test.py
检查分页：    ✓ 总数 100，首页 10 条，缩略图走代理
检查翻页：    ✓ 末页 5 条，首条 full_P096_front
检查搜索：    ✓ 命中 100，无结果时返回空
检查二次元换装库合并：  ✓ chardb 2 条，搜 denim 命中 1
检查缩略图白名单：      ✓ 未知主机 / 非 http / 后缀伪装 全部拒绝
检查未知 id：           ✓ 未知 id 抛 KeyError

✓ 图库路由逻辑全部通过

$ node --check web/gallery.js
✓ gallery.js 语法通过
```

真实数据也跑了一次：

```
真实数据 pose: 1439 条；首页 3 条
  - full_sexy_P001_front | P001 · S形站姿・胯部侧顶 · 正面 | 全身单人・性感系 站姿 正面
  - full_sexy_P001_high  | P001 · S形站姿・胯部侧顶 · 俯视 | 全身单人・性感系 站姿 俯视
  - full_sexy_P001_low   | P001 · S形站姿・胯部侧顶 · 仰视 | 全身单人・性感系 站姿 仰视
```

## 诚实边界

- **没有在真实 ComfyUI 里跑过**。本机没有 ComfyUI 服务，`register_routes()` 在非 ComfyUI 环境下直接 `return`，所以「路由挂上去、前端能加载、弹窗能打开」这三步都没有证据。能证明的是：路由的纯逻辑正确、JS 语法正确、真实数据能取到。
- **前端用了 `app.registerExtension` + `beforeRegisterNodeDef`**，这是 ComfyUI 的公开扩展点，但不同版本 `node.widgets` 的结构有差异。`applyChoice()` 里做了防御（找不到 widget 就静默返回、`options.values` 不存在就跳过），但真机没验过。
- 弹窗是原生 DOM 手写的，没有跟着 ComfyUI 的主题走深浅色。在浅色主题下对比度可能不够。
