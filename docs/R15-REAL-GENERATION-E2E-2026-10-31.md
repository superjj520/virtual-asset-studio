# R15 真实生成与资产复用验收（2026-10-31）

## 验收范围

用真实 fal 密钥、`fal-moss-image` 与 9:16 画幅，在打包后的唯一 Mac App 内完成：

1. 从创作中心建立单张画面方案。
2. 生成 2 张真实候选。
3. 选图并做一次“换光线”单变量调整。
4. 生成第 3 张调整候选。
5. 确认画面、声明使用权。
6. 从“未归档资产”用生成图开始新创作。

## 实测结果

- 首批 2 张：job `99c6f2ff-adfe-4c2b-875b-b8079d4001e3`、`d9265cf1-f5b3-4f27-92e2-2869789167bb`，均为 completed，页面显示真实人像，不再回退到预演卡。
- 调整候选：job `8e4c50ac-d82c-4fe6-8c3c-625f69d5f48d` completed，资产 `358df392-ab83-49ef-9bec-a9d6bc47af86`。
- 资产复用验证：job `63b565b4-d48c-453b-bcce-4c011c2dd29f` 生成资产 `7dc6d113-2285-416b-ad9c-64355f858126`，确认与使用权均通过后，在“未归档资产”可见，并成功作为新创作参考图。
- 重启 App 后 `assets:list({projectId:"asset-library"})` 仍返回 10 个素材且包含该资产，确认持久化生效。

## 本轮修复

1. 代理继承导致 fal 连接失败：启动时清空 `HTTP(S)_PROXY` 等变量并设置 `NODE_USE_ENV_PROXY=1`，改走系统代理。
2. 生成资产未指定项目时会成为界面不可见的孤儿资产：提交 `bffede7`，无项目时归入“未归档资产”，并补测试。
3. 未通过审片或使用权核实的资产仍可点击“用此资产开始创作”，导致参考图列表与实际参考 ID 不一致：提交 `0ea1b14`，统一用 `canReuseAsset` 作为门禁，并补测试。

## 质量门禁

- `npx tsc --noEmit` 通过。
- `npm test`：81 个测试文件、381 项测试通过。
- `npm run build` 通过。
- `npm run package:mac` 通过。
- `npm run verify:release` 通过，release 中只有一个当前 App。
- `npm run smoke:packaged` 通过，四个创作入口均可进入。

## 证据

- 真实候选页：`/tmp/real-candidates-1440.png`
- 修复后资产复用页：`/tmp/reuse-fixed-1440.png`
- 生成原图：`~/Library/Application Support/virtual-asset-studio/managed-assets/c2b972184fd97b17f995be87942498471a77f7ec8ff1efbfe3ddc08a7b331d28/generated.png`

## 尚未完成

- 390px 窄屏本轮的独立真实截图。
- 把生成图“沉淀为角色资产”并形成角色主参考的完整点击链路。
- 用复用参考图再次真实生成，验证身份一致性。
