# R24 · 云端图库分页（2026-11-02）

## 问题

上一轮把云端参考库做到 6,980 条，但界面上只露 48 张。

`src/reference/ReferenceSheetComposer.tsx` 里写死了一句：

```ts
.slice(0, 48);
```

也就是说：**6,932 条素材在界面上根本翻不到**。做了三周的素材规模，用户实际能点到的只有首屏 48 张——除非精确搜索或切到某个小分类。规模优势等于没兑现。

## 改法

**分页状态**：`cloudLimit`（每页 48 张）。

**筛选与截断拆开**：

```ts
const cloudMatched = useMemo(() => /* 只筛选，不截断 */, [catalog, kind, query]);
const cloudCandidates = useMemo(() => cloudMatched.slice(0, cloudLimit), [cloudMatched, cloudLimit]);
```

原来一个 useMemo 同时干筛选和截断，导致算不出「一共匹配多少」。

**改筛选回第一页**：

```ts
useEffect(() => { setCloudLimit(CLOUD_PAGE_SIZE); }, [cloudKind, cloudQuery]);
```

不重置的话，用户搜过 48 张再展开到 200 张，换个分类会直接铺 200 张，滚动位置突兀。

**状态行说清三件事**：

```
96 张已显示 / 匹配 6980（库内 6980）
```

之前是「48 张显示 / 6980」，读起来像是「库里只有这些」。

**按钮**：网格下方居中，「再看 48 张 · 还剩 6884 张」。数字随剩余量变化，最后一批显示「再看 12 张」这类真实数量；剩 0 张时按钮消失。

## 测试

新建 `src/reference/ReferenceSheetComposer.paging.test.tsx`，3 项：

1. 首屏铺 48 张，第 60 张不可见，按钮写着「再看 12 张」
2. 点一次后 60 张全部铺出，按钮消失
3. 改搜索词后回到第一页（不沿用上一次的展开深度）

门禁：91 文件 / **444 测试全过**，build 通过。

## 真机验证

CDP 实测（`artifacts/screenshots/cloud-load-more.png`）：

| 状态 | 状态行 | 卡片数 | 按钮 |
|---|---|---|---|
| 首屏 | 48 张已显示 / 匹配 6980 | 48 | 再看 48 张 · 还剩 6932 张 |
| 点一次 | 96 张已显示 / 匹配 6980 | 96 | 再看 48 张 · 还剩 6884 张 |

## 剩下的空间问题

一次铺 96 张时，DOM 里是 96 个 `<img loading="lazy">`。真要铺到几千张得换虚拟滚动，但那是「用户主动点 60 次」才会到的地方，现在不值得做。先按 48 递增观察实际使用。
