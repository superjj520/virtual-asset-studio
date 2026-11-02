# R50 体检面板可调抽样档位

日期：2026-11-03

## 问题

素材库体检从 R32 起每源固定抽 3 张图。3 张能判断「这个源还活着吗」，但判断不了
「这个源的图是不是大部分还在」——1,439 条里抽 3 张，命中一张坏图的概率很低。
用户想自己验证素材库是否完整，只有这一个 3 张的档位。

## 改动

- `electron/services/reference-library.ts`：`health(sampleSize = 3)`，内部
  `const sample = Math.min(50, Math.max(1, Math.trunc(sampleSize)))`，传给每源的
  `pickSample(pickUrls(rows), sample)`。
- `electron/runtime.ts`：IPC `reference-library:health` 接受 `{ sampleSize?: number }`。
- `src/vite-env.d.ts`：`health(sampleSize?: number)`。
- `src/App.tsx`：`cloudHealthSample` state（默认 3），设置页体检区块的「开始体检」
  按钮前加档位选择 `3 张 / 10 张 / 20 张 / 50 张`，`runCloudHealth()` 带上档位。
- `src/styles.css`：`.cloud-health-sample`（inline-flex、12px、`--ink-muted` 兜底）。
- 测试 `electron/services/reference-library.test.ts` 新增 describe「素材库体检的抽样档位」3 项：
  默认只抓 3 张、传 20 就抓 20 张且都判 ok、传 999 也只抓 50 张。

## 为什么上限是 50 而不是「全量」

全量是 8,131 张。上游限速很凶（R31 实测 `curl` 拉 `pose-zh.json` 会断在 129 KB、
`costume-zh.json` 断在 573 KB），一次性发 8,131 个请求会把上游打限速，
**体检本身变成故障源**。50 张 × 6 源 = 300 个请求，已经在几秒到十几秒量级，
够看出「某个源整体挂了」还是「个别图 404」。

## 门禁

- `npx tsc --noEmit` 无输出
- `npm test` 95 文件 / **510 测试全过**（507 → 510）
- `npm run build` 通过
- `npm run package:mac` → 发布校验通过（release 中只有一个当前 App）
- `npm run smoke:packaged` → 4 个入口

## 诚实边界

- 档位控件在设置页「素材库体检」区块内、开始体检按钮左侧，**本轮没有单独截图**。
  行为由 3 项单测（3/20/50 三档的实际抓图数）覆盖；控件本身的渲染未取证。
- 抽样仍然是抽样。50 张 × 6 源能判断「源整体健康度」，不能证明 8,131 张每张都能打开。
