---
id: TASK-0306
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: BUG-0130
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0130]
execution: serial
branch: main
worktree:
base_commit: 7841d9198
read_paths:
  - apps/desktop/src/renderer/domains/settings/components/ModelsSettingsView.tsx
  - apps/desktop/src/main/models/model-settings-service.ts
  - apps/desktop/src/main/ipc/fs.ts
write_paths:
  - apps/desktop/src/renderer/domains/settings/components/ModelsSettingsView.tsx
  - apps/desktop/src/renderer/domains/settings/components/ModelsSettingsView.test.tsx
  - apps/desktop/src/renderer/domains/settings/components/McpJsonEditor.tsx
  - apps/desktop/src/renderer/domains/settings/components/useGeneralSettingsModel.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useAppInit.ts
  - apps/desktop/src/renderer/shared/store/project-atoms.ts
  - apps/desktop/src/main/models/model-settings-service.ts
  - apps/desktop/src/main/mcp/mcp-settings-service.ts
  - apps/desktop/src/main/utils/workspace.ts
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/api-types/models.ts
  - apps/desktop/src/preload/api-types/config.ts
  - apps/desktop/src/preload/api-types/mcp.ts
  - apps/desktop/src/preload/apis/system.ts
  - apps/desktop/scripts/update-models-dev-snapshot.ts
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 模型设置页脚显示运行时真实配置路径（BUG-0130）

## 目标

设置 → 模型配置 页脚从硬编码 `~/.vetta/agent/models.json` 改为显示主进程 `MODELS_CONFIG_PATH` 的运行时值（默认 `~/.openforge/agent/models.json`，随 `VETTA_HOME`/`VETTA_CONFIG_DIR` 与旧根迁移规则变化）。

## 范围

### 并发评估

- 结论：条件支持（settings 视图面与在途任务不相交）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：见 write_paths
- Branch：`main`；Worktree：主工作区（串行）
- 集成负责人：本 Task 执行者；集成顺序：独立原子提交

### 做

- 导出 `MODELS_CONFIG_PATH`；新增 IPC `vetta:models:config-path`（preload `models.configPath()`）；
- `ModelsSettingsView` 页脚取 IPC 值渲染；顺带把 `update-models-dev-snapshot.ts` 文档注释里的旧 `~/.vetta/...` 缓存路径改为中性表述（本轮触碰文件内的存量注释）。

### 不做

- 不批量清理主进程代码注释层的历史 `~/.vetta` 字样（约十处、非用户可见，另行登记）；不改 models 读写路径与迁移逻辑。

## Given / When / Then

- Given：数据根已迁移/覆盖为任意合法值；When：打开模型配置页；Then：页脚显示该环境下的真实 models.json 绝对路径。

## 必须保持

- 配置读写与迁移行为零变化；`models.get/set` 合同不变（新 IPC 只读且独立）。

## 测试与验证

- 定向：`ModelsSettingsView.test.tsx`（页脚渲染 IPC 返回值，旧实现红）。
- 质量：`bun run check:quick` → 完整 `bun run check`。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户在设置页目验路径。发布：未授权。

## 交付记录

- 实际修改（含续轮扩展——同族旧品牌路径残留的用户可见/行为面清扫）：
  - 模型页脚：`model-settings-service.ts` 导出 `MODELS_CONFIG_PATH`；`fs.ts` 只读通道 `vetta:models:config-path`；`models.configPath()`；`ModelsSettingsView` 页脚动态渲染（取不到不渲染）。
  - MCP 提示：`mcp-settings-service.ts` 导出 `MCP_CONFIG_PATH`；通道 `vetta:mcp:config-path`；`mcp.configPath()`；`McpJsonEditor` 提示动态化。
  - 默认工作区（行为级）：`workspace.ts` 导出 `DEFAULT_WORKSPACE_PATH`；`DesktopConfigSnapshot`/`DesktopConfig` 增 `defaultWorkspaceCwd`（CONFIG_GET 富化）；`useAppInit` 未设置时回落主进程默认（不写 localStorage，保留「未设置」语义）；`resetWorkspace` 改写主进程返回的真实路径（旧行为把字面量 `~/.vetta/workspace` 写进配置，经 `expandTilde` 落到已迁移走的旧根并重建 `.vetta` 目录）；`project-atoms` 占位字面量改 `~/.openforge/workspace`。
  - `update-models-dev-snapshot.ts` 注释中性化；`api-types/config.ts` 与 `fs.ts` 快照类型注释同步中性化。
- 实际运行：`ModelsSettingsView.test.tsx` 2 例 + conversation hooks 9 例全绿；typecheck 0 错误；完整 `bun run check` exit 0。
- 未运行及原因：实机设置页/通用设置页目验（交用户）；`resetWorkspace`/MCP 提示为薄接线无既有测试文件，未新增独立套件（行为由快照类型与 enrichment 约束）。
- Worktree：主工作区串行，未拆出。
- 剩余风险：注释层 `~/.vetta` 字样实测 60+ 处（apps/desktop、packages/* 源码与 examples；dist 为生成物不计数），非用户可见，登记在 BUG-0130 待后续批量清理（涉及上游同步 diff 成本，需单独窗口）。
