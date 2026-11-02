# R47 节点包的五套检查收成一条命令

## 问题

ComfyUI 节点包的检查一直是散着的：

```
python3 comfyui-vas-nodes/contract_test.py
python3 comfyui-vas-nodes/prompt_test.py
python3 comfyui-vas-nodes/depth_test.py
python3 comfyui-vas-nodes/routes_test.py
node    comfyui-vas-nodes/web/gallery_smoke.mjs
python3 comfyui-vas-nodes/selftest.py --refresh
```

每次改完节点，得手打五条、自己看有没有 ✗。这跟 `npm test` 的差别是：`npm test` 会替你做决定（退出码非 0 就是坏），而这五条得由我判断。判断环节出过一次问题——R37 那个「声明 2 个返回、实际返回 3 个」的静默丢值 bug，就是因为当时只看输出里没有红字。

## 现在

```bash
npm run verify:nodes            # 五项离线检查，不需要网络
npm run verify:nodes -- --online  # 再加一项：六个上游源还在不在
```

退出码非 0 就是有东西坏了，和 `npm test` / `verify:panel` 一个规矩。

`--online` 默认关闭的理由：那六项要连 anhao、深度站、动漫衣装站、char-db，跑一次几十秒，网络抖动还会让结果时好时坏。它属于「我怀疑上游变了」时的手动检查，不该挂在每次提交上。

## 顺手修的两个真问题

**1. selftest 的 chardb 基线过期。** 写的是 1,027，实际 2,347——R31 就发现上游涨了并在代码里改过，但 selftest 的 `EXPECTED` 没跟着改，所以它一直在报 `!`。已改成 2,347，并加注释说明这些数字是 2026-11-02 的实测基线。

**2. selftest 被系统代理挡住。** 本机 macOS 配了 `127.0.0.1:10900`，那个代理现在没在运行，`urllib` 直接 `Connection refused`——六个源全判失败，看起来像数据源挂了，其实一行代码问题都没有。改成 `build_opener(ProxyHandler({}))` 直连，因为这几个站本来就不需要代理。

顺带给取图加了两次重试：这几个图床都在国外，SSL 握手偶尔超时；重试后跑一次的结果才稳定，否则「数据源好不好」取决于当次网络抖动。

## 现在的验证入口

| 命令 | 覆盖 | 要不要网络 |
|---|---|---|
| `npm test` | 95 文件 / 505 项（渲染层 + 主进程 + 纯逻辑） | 否 |
| `npm run verify:panel` | 参数面板真机 12 项断言（起 Electron） | 否 |
| `npm run verify:nodes` | 节点契约 / 提示词 / 深度匹配 / 图库路由 / 选图弹窗 | 否 |
| `npm run verify:nodes -- --online` | 上面五项 + 六个上游源 | 是 |
| `npm run package:mac` + `verify:release` | 打包与发布校验 | 否 |
| `npm run smoke:packaged` | 打包后的 App 四入口冒烟 | 否 |

## 诚实边界

- `verify:nodes` 证明的是「节点声明自洽、数据能取到、路由能返回、弹窗逻辑对」，**不证明「装进 ComfyUI 能画出图」**——那需要真实 checkpoint，本机没有。R40 在真 ComfyUI 里验证过节点加载与四个工作流出图（不含模型质量）。
- `--online` 只看「六个源还在不在、首图能不能打开」，不看全部 8,131 张（会踩上游限速）。
