# 虚拟资产创作工作台竞品研究与升级决策

更新时间：2026-10-16

## 结论先行

当前工作台的产品骨架已经足够支撑 B 端创作管理：创作、资产、生产、模板四域清晰，角色档案、素材权利、主参考、候选审片、队列、配方和项目导出已经形成一条本地可追溯链路。

但“功能齐全”不等于“创作闭环已经稳定”。竞品的共同优势不是页面更多，而是把参考资产、模型行为、结果复用和失败恢复解释清楚。本轮优先修复以下四项：

1. 生成失败或状态未知时，任务必须进入“生成阻塞”，不能一直停留在“生产中”。
2. 画幅必须在进入提示词编译和保存前归一化，历史数据中的 `4:5` 映射为当前支持的 `2:3`，避免界面选择与实际提示词不一致。
3. 参考图必须说明“主参考”和“任务记录中的其他参考”，不能暗示模型已经读取了所有图片。
4. 竞品能力和本地实现边界必须写入文档，后续迭代按优先级补齐，不继续无边界增加导航和重复应用。

## 竞品对照

| 产品 | 已核验能力 | 对本工作台的启示 | 当前状态 |
| --- | --- | --- | --- |
| Midjourney Web | 上传素材库、文件夹、图像提示、风格参考、编辑模型、局部重绘、扩图、变体和复用提示词 | 参考图要有明确角色，结果要能回到原任务复用 | 已有资产引用和任务记录；本轮补充主参考语义与失败状态 |
| Scenario | 素材、集合、自定义模型、标签、工作流、角色一致性和可复用资产 ID | 角色不是单张图片，而是可被工作流引用的资产集合 | 已有角色档案、资产包、主参考和用途化细项；后续补标签与引用追踪 |
| Runway | 可保存的参考媒体、工作区共享、品牌参考集合、多参考图和任务轮询 | 参考媒体需要“保存/临时”和用途说明；队列需要明确成功、失败和重试 | 已有受管素材库和生成队列；本轮补阻塞状态 |
| Adobe Firefly | 自定义模型、品牌/角色主题、Style Kits、共享提示词和参考图、内容凭证 | 可复用模板应该绑定验证结果、参考资产和适用范围，而不是只存一段文字 | 已有创作配方、视觉范式、学习来源和导出；后续补验证证据摘要 |
| Ideogram Canvas | 无限画布、上传、生成、重混、局部填充、扩展、裁剪和多结果比较 | 生产阶段需要候选比较和局部修订，不能只有一次生成按钮 | 已有候选审片、批量变量和结果资产；后续补更清晰的比较入口 |

## 证据来源

- Midjourney：[Creating on Web](https://docs.midjourney.com/hc/en-us/articles/33390732264589-Creating-on-Web)、[Editor](https://docs.midjourney.com/hc/en-us/articles/32764383466893-Editor)、[Style Reference](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference)
- Scenario：[Introduction](https://help.scenario.com/articles/3401611429-introduction)、[MCP server](https://help.scenario.com/articles/2664328768-getting-started-with-the-scenario-mcp-server)、[Image workflows](https://help.scenario.com/en/c/workflows)
- Runway：[Brand Kits](https://help.runwayml.com/hc/en-us/articles/47057921993491-Brand-Kits-for-Enterprises)、[Reference media](https://help.runwayml.com/hc/en-us/articles/52963720640275-Using-reference-media)、[Reference media guidelines](https://docs.dev.runwayml.com/recipes/reference-media/)
- Adobe：[Firefly product guide](https://business.adobe.com/assets/resources/guides/adobe-firefly-product-guide.pdf)、[Style Kits 与自定义模型说明](https://news.adobe.com/assets/downloads/pdfs/2024/03/032624adobefirefly-updated-links-docx.pdf)
- Ideogram：[Canvas overview](https://docs.ideogram.ai/canvas-and-editing/canvas/canvas-overview)、[Generate & Remix](https://docs.ideogram.ai/canvas-and-editing/canvas/generate-and-remix)

## 差距与优先级

### 本轮已闭环的 P0

- 远程图片生成失败、轮询失败和状态未知会写回“生成阻塞”，用户可以看到原因并按原请求重试。
- 历史画幅值进入保存、编译和生成前统一归一化，避免 `4:5` 等旧值污染新任务。
- 创作卡明确显示当前绘图模型、第一张主参考的实际发送语义，以及其他参考仅保留在任务记录/资产包中的事实。
- 现有测试覆盖上述行为，避免文案或状态改动再次破坏主流程。

### 下一阶段的 P1

- 为参考资产增加可选语义：主参考、脸部、服装、姿态、材质、场景；未被适配器实际读取的引用必须保持“未发送”状态。
- 生成队列增加幂等重试记录、失败原因分类、重试次数和最后一次模型响应摘要。
- 资产包增加按角色、造型变体、用途、权利状态、来源和验证状态的筛选，并在任务详情显示反向引用。
- 候选比较显示同一创作卡、模型、画幅、参考资产和提示词版本，避免结果无法复盘。
- 创作配方增加“已验证证据”摘要、适用范围和失效条件。

### 明确暂缓的能力

- 视频模型、3D 生成、远程协作、云同步和自动抓取公开网站素材不纳入本轮发布门槛。
- 不通过增加新的导航域解决问题；所有新增能力优先落入现有四域和二级分类。

## 发布验收门槛

- [x] 现有角色、资产、创作、生产、模板主链路保持可用。
- [x] 生成失败不再把任务永久留在“生产中”。
- [x] 历史画幅值不会绕过当前支持范围。
- [x] 参考图发送范围在界面和任务记录中可解释。
- [x] `npm test` 全部通过。
- [ ] 至少配置一个可用的远程图片模型并完成真实网络生成；这取决于用户提供的模型密钥、网络和配额，不能由本地构建替代。

## 研究判断边界

竞品文档能证明它们公开声明了哪些工作流能力，不能证明每个模型在本机网络、账号权限或具体提示词下都能成功生成。工作台的本地测试、构建和发布校验属于已验证事实；Gemini 等外部模型的连通性和实际成图属于环境相关的待验证项。
