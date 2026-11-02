# R26 · 任务列表排序稳定（2026-11-02）

## 问题

R25 真机验证时，8 个任务的显示顺序是 `07、08、03、04、05、06、01、02`——不是创建顺序，也不是名字顺序，看起来随机。

`electron/services/tasks/repository.ts:31-32`：

```sql
SELECT * FROM creative_tasks ORDER BY updated_at DESC
```

`updated_at` 只精确到毫秒。批量创建（脚本、导入、连续点击）时多个任务落在同一毫秒，`ORDER BY` 缺少次级键，SQLite 返回顺序就不保证稳定——刷新一次可能换一个样。

## 改法

```sql
ORDER BY updated_at DESC, created_at DESC, id DESC
```

三级兜底：更新时间 → 创建时间 → id。前两个撞车（同一毫秒建、同一毫秒改）时，id 仍能给出确定顺序。

## 测试

`electron/services/tasks/repository.test.ts` 新增一例：

1. 连建 8 个任务
2. 把 8 行的 `updated_at` 和 `created_at` 全部改成同一个时间戳
3. 连续调两次 `list()`，断言两次结果完全一致
4. 断言顺序等于 id 倒序（证明是 id 兜底生效，而不是碰巧）

全量：93 文件 / **452 测试通过**。

## 一个 flaky 现象

全量跑时 `src/App.test.tsx > 系列方向按整组四镜比较并保留顺序进入逐镜调整` 报 `Test timed out in 15000ms`，单独跑该用例通过。属于并发下的偶发超时，与本改动无关，未处理。

## 同类模式（未改，留记录）

`grep -rn "ORDER BY" electron/services` 显示这几个列表也只有单键：

- `electron/services/scenes/workspace-repository.ts:167-168` `ORDER BY updated_at DESC`
- `electron/services/learning/repository.ts:43` `ORDER BY updated_at DESC`
- `electron/services/learning/source-repository.ts:16` `ORDER BY imported_at DESC`

场景档案和配方库同样会批量导入（配方包导入就是一次建多条），有一样的风险。本次只修任务列表——一次只解决一个可观察的问题；其余等有实测复现再动。
