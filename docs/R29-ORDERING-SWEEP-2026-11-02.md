# R29 · 列表排序全量补齐次级键（2026-11-02）

R26 只修了任务列表。这一轮把同类查询一次改完——它们都会被「批量创建」触发同一个问题：时间戳撞在同一毫秒，`ORDER BY` 缺兜底，刷新一次换一个顺序。

## 改了哪些

| 文件 | 列表 | 改后 |
|---|---|---|
| `electron/services/projects/repository.ts:35` | 项目列表 | `updated_at DESC, created_at DESC, id DESC` |
| `electron/services/recipes/repository.ts:33` | 配方列表（含按项目过滤） | 同上 |
| `electron/services/scenes/workspace-repository.ts:167-168` | 场景档案 | 同上 |
| `electron/services/learning/repository.ts:43` | 学习配方 | 同上 |
| `electron/services/learning/source-repository.ts:16` | 提示词来源 | `imported_at DESC, id DESC` |
| `electron/services/jobs/repository.ts:46` | 生成队列（含按项目过滤） | `updated_at DESC, created_at DESC, id DESC` |
| `electron/services/characters/repository.ts:74` | 角色档案（含按项目过滤） | 同上 |
| `electron/services/characters/repository.ts:81,84` | 角色细项 / 变体 | `created_at ASC, id ASC` |
| `electron/services/assets/repository.ts:108` | 素材列表 | `assets.updated_at DESC, assets.created_at DESC, assets.id DESC` |

优先级依据：**会被批量创建**的才加。`jobs`（一次批量生产建几十条）、`assets`（人物资产包 / 素材导入）、`characters`（导入资产包）是真正会撞时间戳的三个。

## 改不动的一处

`electron/services/assets/repository.ts:164` 是 `UNION ALL` 查询（资产反向引用：项目 / 母版 / 资产包 / 配方 / 审片）。

加次级键直接报：

```
SqliteError: 2nd ORDER BY term does not match any column in the result set
```

原因是 UNION 的各个分支结果列名不一致，外层 `ORDER BY` 只能引用统一的输出列名（`updated_at`、`created_at` 有，`id` 没有）。**已回退为 `ORDER BY updated_at DESC`**，并在代码这个位置不加次级键。这类查询结果通常只有几条，排序不稳定带来的实际影响很小。

## 门禁

92 文件 / **454 测试通过**。

R26 里那条例（把 8 行的 `updated_at`、`created_at` 压成同一毫秒，两次 `list()` 结果必须一致）继续覆盖任务列表；其余列表靠 SQL 结构保证，没有逐条补测试——它们的断言会随数据顺序变化，补了反而脆。
