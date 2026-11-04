# 文档索引

`docs/` 下 60 多份文件，大部分是每一轮改动的记录。**先看下面「必读」四份，其余当参考查。**

## 必读

| 文件 | 什么时候看 |
|---|---|
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | 改界面之前——语义令牌、间距、组件边界 |
| [DESIGN-DELIVERY-PROTOCOL.md](DESIGN-DELIVERY-PROTOCOL.md) | 交付前——什么算「验收过」 |
| [PRODUCT-ACCEPTANCE.md](PRODUCT-ACCEPTANCE.md) | 每个验收项的行为与持久化要求 |
| [PRODUCT-REFERENCE-LIBRARY.md](PRODUCT-REFERENCE-LIBRARY.md) | 素材库怎么用、权利怎么记 |

## 素材库

| 文件 | 内容 |
|---|---|
| [R48-CAPABILITY-INVENTORY-2026-11-03.md](R48-CAPABILITY-INVENTORY-2026-11-03.md) | 能力盘点表，每项标了证据位置 |
| [R52-SHISEI-CC0-ASSESSMENT.md](R52-SHISEI-CC0-ASSESSMENT.md) | 上游 `wquguru/shisei` 逐目录评估：哪类接了、哪类没接、为什么 |
| [R58-REFERENCE-QUALITY.md](R58-REFERENCE-QUALITY.md) | 素材库质量体检：重名、检索命中、字段完整 |
| [REFERENCE-SHEET.md](REFERENCE-SHEET.md) | 参考板的四层语义与拼装规则 |

## 生成与 ComfyUI

| 文件 | 内容 |
|---|---|
| [R56-LOCAL-SERVICE.md](R56-LOCAL-SERVICE.md) | 本地素材服务：七个端点、curl 示例、端口、安全边界 |
| [R57-LOCAL-GENERATE.md](R57-LOCAL-GENERATE.md) | `/generate` 用法、四条通道（文生图/参考图/深度/法线）、占位符表、已知边界 |
| [R53-NODE-PARITY.md](R53-NODE-PARITY.md) | 与 anhao 的节点对照：参数等价表、哪些差异不是缺口 |
| [R54-QWEN-EDIT-WORKFLOW.md](R54-QWEN-EDIT-WORKFLOW.md) | Qwen-Image-Edit 工作流：模型清单、接线、我在这台机器上试到的结果 |
| [R31-COMFYUI-PARITY-2026-11-02.md](R31-COMFYUI-PARITY-2026-11-02.md) | 第一轮对照，节点包怎么来的 |
| `../comfyui-vas-nodes/README.md` | 节点包怎么装、十个节点各干什么、要哪些模型 |

## 竞品

| 文件 | 内容 |
|---|---|
| [COMPETITIVE-PK-ANHAO-RUIC-2026-11-01.md](COMPETITIVE-PK-ANHAO-RUIC-2026-11-01.md) | 与 anhao / ruic 的逐项对比 |
| [R55-PROMPT-COMPETITOR-TRUEJPEG.md](R55-PROMPT-COMPETITOR-TRUEJPEG.md) | truejpeg.com 的提示词结构拆解与四条真差距 |

## 按轮次的改动记录

`R16-*` 到 `R58-*` 是逐轮记录，编号即顺序。查某功能为什么长这样时按主题搜文件名；不需要通读。

## 怎么验

```bash
npm run verify:all      # 17 步：单测→构建→真机→打包→重启恢复，约 45 分钟
```

单独跑某一步见 `package.json` 的 `scripts`，`verify:*` 开头的都是。**环境缺失的步会标 ⊘ 而不是 ✓**——ComfyUI 没起时「本地服务出图真机」与「节点包真机」就是跳过的。
