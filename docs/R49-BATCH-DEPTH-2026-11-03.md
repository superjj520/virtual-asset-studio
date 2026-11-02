# R49 批量任务也带深度图

## 为什么

R43 把深度图接到了单张出图链路：`card.depthAssetId` → `depthPath` → ComfyUI 的 `{{depth_image}}`。
批量路径没接，理由是「要给 SQLite 表加列」。这一轮把这个洞补上。

用户看到的行为：在参考卡里挂了深度图，然后走批量生产，以前深度图会被静默丢掉；
现在批次会记住它，出图时逐张送给支持 ControlNet 的 provider。

## 改了什么

| 层 | 改动 |
|---|---|
| `electron/db/schema.ts` | `generation_batches` 加 `depth_asset_id TEXT`；迁移块按 `PRAGMA table_info` 判断后 `ALTER TABLE ADD COLUMN` |
| `src/shared/types.ts` | `GenerationBatch` 加 `depthAssetId?: string` |
| `electron/services/batches/repository.ts` | `BatchRow` 加列、`create` 接受 `depthAssetId`、INSERT 加列与占位符、`map` 读回 |
| `electron/runtime.ts` | 批量生成处解析 `batchDepthReference`，`refineWithResult` 展开 `depthPath` / `depthMediaType` |
| `src/App.tsx` | `batches.create` 传 `card.depthAssetId` |
| `src/vite-env.d.ts` | IPC 类型补 `depthAssetId` |

## 一个设计判断：故意不加外键

第一版写的是 `depth_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL`，测试立刻炸：

```
SqliteError: FOREIGN KEY constraint failed
```

因为测试传的 `depth-7` 在 `assets` 表里不存在。

但真正让人停下来想的是另一个问题：**同一张表里的 `reference_asset_ids_json` 和 `reference_bindings_json` 都是纯 TEXT，没有外键**。
如果只给深度图加外键，就会出现「删掉一张资产时，批次的深度被静默置空，而参考图还留着」——两者本来是同一类逻辑引用，行为不该分叉。

所以去掉外键，只留 `TEXT`，跟旁边的字段一个口径。

## 验证

- `npm test` **95 文件 / 507 测试全过**（新增 2 项：深度图存进去、关库重开还在；没挂深度图时字段是空的）
- `npx tsc --noEmit` 无输出、`npm run build` 通过
- `npm run package:mac` → `发布校验通过：release 中只有一个当前 App`
- `npm run smoke:packaged` → `4 个入口`

## 诚实边界

只证明「批次能存住深度图并读回来」。**没有跑真的批量出图**——那需要运行中的 ComfyUI + 含 `{{depth_image}}` 的工作流 + 真实 checkpoint，本机没有。
链路证据：仓库层往返（单测）→ `runtime` 解析 `batchDepthReference`（类型 + 代码路径）→ provider 收到会上传并注入（R31 的 12 项测试）。
