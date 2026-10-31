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
4. 资产卡缩略图使用默认 `object-fit: fill`，竖图被压扁成不可辨认的色块：改为封面裁切并优先保留人物上半身，重新打包验证。

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
- 资产库封面裁切：`/tmp/final-assets-cover-1440.png`
- 角色资产桌面：`/Users/superjj/virtual-asset-studio/artifacts/r15/角色资产-1440.png`
- 角色资产 390px：`/Users/superjj/virtual-asset-studio/artifacts/r15/角色资产-390.png`
- 生成原图：`~/Library/Application Support/virtual-asset-studio/managed-assets/c2b972184fd97b17f995be87942498471a77f7ec8ff1efbfe3ddc08a7b331d28/generated.png`

## 角色资产闭环

- 用资产 `7dc6d113-2285-416b-ad9c-64355f858126` 作为参考图，使用 `fal-flux-kontext` 再生成一张图。
- job `000ba91f-0923-4e9f-8793-c812e0b5d434` completed，资产 `2da9285d-c594-464c-9848-38dba5b9dd43`。
- 在画面归档页完成权利复核，点击“沉淀为角色资产”，生成角色 `6edc48c2-b575-43ac-94cf-e7ee5a2936cf`，主参考指向该资产，并同步资产包与创作任务。
- 修复角色默认命名：原来会把“按参考图……”整段任务标题写进角色名，改为优先使用视觉方向名称。
- 390px 归档页已检查：底部四项导航、单主操作、无遮挡。

## 跨会话角色生成

- 重启 App 后，角色「月下东方 · 角色」仍在角色档案中，主参考指向 `2da9285d-c594-464c-9848-38dba5b9dd43`。
- 从角色档案选择“用此角色做新场景”，再切到单张画面，在“角色资产”中选择该角色；新任务 `56f5c9f8-6df5-43b8-b1db-a3a8c86d020b` 已绑定 `character_profile_id=6edc48c2-b575-43ac-94cf-e7ee5a2936cf`。
- 补齐肖像门禁后，使用 FLUX Kontext 真实生成 2 张候选：job `42c6ebda-6b8a-4ac6-85d3-ef71bb7a7788`、`a3970fff-6e43-4292-9e8f-e081983351af`，资产 `8ea74d38-9199-4875-bb36-118b3d8f4b31`、`9d9af0f6-a4dd-4794-8055-2b7a54ec802d`。
- 两张候选与角色主参考的脸型、五官、发色和发型一致；截图 `artifacts/r15/角色生成候选-1440.png`。
- 重要限制：从候选沉淀出的角色会先创建为草稿，肖像细项为空；本次按主参考逐项补齐 9 项证据后才进入生成。产品应在角色卡上明确提示“沉淀后需补齐肖像”，而不是显示为可直接生成。

## 移动端修复

- 候选对比页：`src/styles.css` 将 `.creation-studio-grid.stage-candidates` 的底部留白从 88px 提高到 `calc(164px + env(safe-area-inset-bottom))`。390px 下滚到第二张卡时，“选为当前/查看并审片”均在固定批量栏上方可点击；固定栏仍会在中间滚动位置覆盖画面，但不再永久遮挡最后一张卡。
- 素材库：≤620px 隐藏 `.control-panel .project-create`，先展示筛选与素材网格；截图 `artifacts/r15/素材库-390.png`、`artifacts/r15/素材库列表-390.png`。
- 候选对比截图：`artifacts/r15/候选对比-390.png`。

## 恢复入口修复

- 发现 `screen === "workspace"` 的创作域启动页没有传 `resume`，所以从侧栏点“创作”时看不到已保存的会话；启动页 `screen === "launch"` 一直有。
- 已给 embedded `CreationLaunchpad` 补上 `resume` 与 `onDiscardResume`，重新打包后启动页可见“继续上次创作 · 单张画面 · 上次保存在 …”，并提供“继续/重新开始”。
- 注意：会话仍然只保存到本地 `virtual-asset-studio.creation-session.v1`，不是任务数据库恢复；清除浏览器存储后会丢失入口。

## 角色可用性收口（2026-10-31）

- 候选沉淀为角色时，现在会同时把创作卡中已经点选的身份、五官、发型、肤色与表情写入人物细项；面部正面自动绑定候选主参考，但先以“待确认”写入，不冒充已确认。
- 角色档案新增“用主参考确认面部正面”一键操作：主参考已就位时，只需确认这一项即可达到肖像生成门禁，不再需要手工重填 9 项。
- 角色来源列表不再把所有有主参考的角色写成“可直接使用”，改为“已建立主参考 · 生成前核对肖像细项”，避免承诺与实际门禁不一致。
- 测试：角色事实种子 4 项、角色检查器 7 项、角色来源 11 项；全量 383 项通过。

## 尚未完成

- 候选沉淀角色时的“肖像必填项”引导仍偏重；应增加“从主参考一键生成待确认细项”的入口，减少 9 项手工补齐。
- 390px 固定批量栏在中间滚动位置仍覆盖内容，后续可改为 `position: sticky` 或随滚动收起。
