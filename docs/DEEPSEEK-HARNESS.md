# DeepSeek Harness 接续开发说明

## 使用定位

DeepSeek Harness 是本项目的辅助开发执行环境，不是新的产品仓库，也不是第二套正式应用。所有可交付成果仍以本仓库、独立功能分支和唯一 Mac 应用为准。

## 推荐工作区

使用独立 Git Worktree：

```text
/Users/superjj/virtual-asset-studio-dsh
```

不要让 Harness 直接在包含未提交改动的主工作区中执行批量修改。

## 启动

在 Worktree 中运行：

```bash
cd /Users/superjj/virtual-asset-studio-dsh
npx @deepseek-ai/dsh web
```

默认本地地址为 `http://127.0.0.1:3080`。在 Web UI 的模型设置中填写 DeepSeek API Key，不得把 Key 写入仓库文件。

## 模型分工

- `deepseek-flash`：代码搜索、常规实现、测试修复、截图理解和重复性修改。
- `deepseek-v4-pro`：架构决策、复杂问题复核和需要联网研究的任务。

每项功能推荐由 Flash 实现，再由 Pro 或当前 Codex 会话复核。真实 Mac 应用验收是最终判断依据。

## 首次会话提示

```text
阅读根目录 AGENTS.md 和 docs/PRODUCT-ACCEPTANCE.md。不要修改 main，不要创建第二个正式 App，不要接入或伪装真实模型能力。只处理用户指定的一个验收编号。先说明当前行为、目标行为、代码边界和验证方法，再开始修改。完成后必须提供测试、构建、真实窗口和重启恢复证据。
```

## 分支规则

每个验收项使用独立分支，例如：

```text
deepseek/C1-single-image-choice-flow
deepseek/C2-series-shot-workbench
deepseek/R1-restart-recovery
```

每个分支只解决一个验收编号。通过审查后再合入 `codex/dynamic-character-workspace`，九项全部验收后才考虑合入 `main`。

## 禁止事项

- 不运行破坏性 Git 命令。
- 不提交用户数据库、API Key、安装包、用户素材或取证原始文件。
- 不用测试通过替代真实应用验收。
- 不自行扩展视频、远程协作、云同步等范围。
- 不直接覆盖唯一正式应用，除非该分支已经通过完整发布门禁。
