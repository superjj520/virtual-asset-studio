# R27 · 缩略图缓存加上限（2026-11-02）

## 问题

`electron/services/reference-library.ts` 里：

```ts
private readonly thumbnailCache = new Map<string, string>();
```

无上限、无过期、不淘汰。

每张缩略图以 base64 data URL 常驻主进程内存。实测尺寸：anhao 的 webp 缩略图约 13KB，base64 后约 18KB；char-db-cn 的 webp 类似。

R24 让云端图库可以一直往下翻之后，这个缓存第一次有了被翻满的路径：

| 翻到 | 缓存占用 |
|---|---|
| 48 张（首屏） | ≈ 0.9 MB |
| 300 张 | ≈ 5.4 MB |
| 6,980 张（全库） | ≈ **126 MB** |

主进程内存只涨不落，直到应用退出。

## 改法

上限 300 张 + LRU 淘汰：

```ts
constructor(..., options: { maxThumbnails?: number } = {}) {
  this.maxThumbnails = Math.max(1, options.maxThumbnails ?? 300);
}

// 命中：提到最新
const cached = this.thumbnailCache.get(url);
if (cached) {
  this.thumbnailCache.delete(url);
  this.thumbnailCache.set(url, cached);
  return cached;
}

// 写入：超上限就淘汰最旧的
this.thumbnailCache.set(url, dataUrl);
while (this.thumbnailCache.size > this.maxThumbnails) {
  const oldest = this.thumbnailCache.keys().next().value;
  if (oldest === undefined) break;
  this.thumbnailCache.delete(oldest);
}
```

`Map` 按插入顺序迭代，删第一个就是最久未用的。上限可注入，测试才好把 2 当上限用。

300 张约等于首屏 6 页，正常浏览（看一页、翻两页、回头选）不会触发淘汰；只有真的长距离来回翻才会重新拉图，那是可接受的代价。

## 测试

新增一例，上限设 2：

1. 拉 a、b → 2 次网络请求
2. 再拉 a → 仍是 2 次（命中缓存）
3. 拉 c → 3 次，最旧的 b 被淘汰
4. 再拉 c → 仍是 3 次
5. 拉 b → 4 次（确认 b 确实被淘汰过）

全量：92 文件 / **453 测试通过**，build 通过。

## 为什么这次没截图

这次改动只影响主进程内存，界面没有任何变化。按 AGENTS.md「没有截图证据不得声称视觉验收完成」——它不属于视觉变更，凭证是测试里的网络请求计数，不是截图。

## 同类问题（未处理）

`electron/services/reference-library.ts` 里还有一个 `this.cache`（目录缓存），它有 `expiresAt`（CACHE_TTL_MS）会自动过期，不属于泄漏。目录本身约 6,980 条元数据，量级远小于缩略图二进制，暂不处理。
