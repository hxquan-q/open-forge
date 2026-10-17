---
id: BUG-0130
type: bug
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: user-report
related_requirement: []
related_plan: []
related_tasks: [TASK-0306]
related_issues: []
related_bugs: []
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 设置页脚仍显示旧品牌数据根的模型配置路径 ~/.vetta/agent/models.json

## 用户流程

- Given：本仓数据根已从 `~/.vetta` 改名迁移到 `~/.openforge`（`packages/action-rpc/src/endpoint-file.ts` 的 `DEFAULT_CONFIG_DIR_NAME`/`migrateLegacyHomeDir`，支持 `VETTA_HOME`/`VETTA_CONFIG_DIR` 覆盖）。
- When：打开 设置 → 模型配置。
- Then：页脚应显示当前运行时真实的 models.json 路径。

## 实际行为

页脚硬编码显示 `配置文件路径: ~/.vetta/agent/models.json`（`ModelsSettingsView.tsx:29`）——旧品牌路径，与本仓数据根（默认 `~/.openforge/agent/models.json`，可被环境变量覆盖）不符，误导用户去改一个已迁移的旧文件。

## 期望行为

页脚显示主进程 `MODELS_CONFIG_PATH`（`join(getVettaHomePath(), "agent", "models.json")`）的运行时真实值。

## 环境与失败证据

- 用户报告（2026-10-18）：「还提交配置文件路径: ~/.vetta/agent/models.json，我现在不是改了吗」。
- 代码锚点：`apps/desktop/src/renderer/domains/settings/components/ModelsSettingsView.tsx:29` 硬编码；真实路径源 `apps/desktop/src/main/models/model-settings-service.ts:70`（模块加载时按 env/迁移规则求值）。

## 最小复现

1. 打开 设置 → 模型配置。
2. 页脚显示 `~/.vetta/agent/models.json`；而磁盘上配置实际位于 `~/.openforge/agent/models.json`（迁移后）。

## 影响

低（P3）：仅提示文案错误，读写路径本身正确；但用户按提示去旧路径建/改文件会不生效，且与品牌迁移后的真实目录矛盾。

## 根因证据

视图层沿用了上游的硬编码文案；本仓数据根改名迁移（`.vetta` → `.openforge`）时未同步该用户可见文案。置信度：高（两端代码锚点直接对照）。

## 回归测试

新增 `ModelsSettingsView.test.tsx`：mock 子分区与 `window.vetta.models.configPath()`，断言页脚渲染 IPC 返回的真实路径——旧实现（硬编码）下该断言失败。

## 修复与验证

- 修复：TASK-0306——导出 `MODELS_CONFIG_PATH`、新增只读 IPC `vetta:models:config-path`、页脚动态显示运行时路径（取不到不渲染）。
- 测试：`ModelsSettingsView.test.tsx` 2 例（含旧实现必红的路径断言）。
- 检查：typecheck 0 错误、完整 `bun run check` exit 0。
- 未运行及原因：实机目验交用户；保持 verifying 至用户确认。
