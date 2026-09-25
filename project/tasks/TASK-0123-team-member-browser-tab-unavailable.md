---
id: TASK-0123
type: task
status: ready
priority: P3
owner: apps/desktop + packages/runtime-*
requirement: []
plan: PLAN-0013
source: ISSUE-0026 实测（审计员/开发员会话 `browser_tab` → `no_browser_session`）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0026]
related_bugs: []
execution: parallel
branch: task/0123-member-browser-tab
worktree: .worktrees/task-0123
base_commit: main
read_paths: [apps/desktop/src/main/agent-teams/, packages/runtime-*/src/（browser_tab 装配与过滤处）, packages/agent/src/]
write_paths: [apps/desktop/src/main/agent-teams/, packages/runtime-*/src/, .github/release-notes/]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 团队成员会话 `browser_tab` 不可用性显式声明

## 目标

成员会话的工具清单包含 `browser_tab`，但团队上下文没有可用 WebView 后端——模型只能撞上
`no_browser_session` 错误后才知道绕行。先按 ISSUE-0026 推荐 A 落地：**不在团队会话中广告
不可用能力**（或在描述中声明不可用与建议降级路径），消除撞错成本。

## 范围

### 并发评估

- 结论：支持并行——成员会话工具装配/过滤面与 TASK-0122 的 leader 侧文件无交集。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0122。
- 前置依赖：先核实 `browser_tab` 在成员会话的注册路径（是直接进成员 toolDefinitions 还是经
  宿主能力收窄），确认不可用判定的实现位置再定改法。
- 冲突文件/独占路径：成员工具装配处（待定位后回填）。
- Branch：`task/0123-member-browser-tab`。
- Worktree：独立 worktree。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0013 阶段 1 次项。

### 做

- 定位 `browser_tab` 进入成员会话工具清单的装配点与 `no_browser_session` 的抛出点；
- 团队/成员会话上下文：从工具清单剔除 `browser_tab`，或保留但将描述改为「本会话无 WebView
  后端；如需渲染验证使用 shell 起本地服务+外部 headless 浏览器」——按定位结果选侵入最小者；
- 若为剔除，确认剔除范围只覆盖团队成员会话，普通 agent 会话的 `browser_tab` 不受影响。

### 不做

- 不为成员会话新建 headless 渲染工具（ISSUE-0026 方案 B，另立评估）；
- 不改变普通会话的浏览器能力；
- 不处理「起 http server 的清理责任」（属方案 B 的范畴）。

## Given / When / Then

- Given：团队成员会话需要验证生成的 HTML；
- When：模型查看可用工具清单；
- Then：清单中不再出现必然失败的 `browser_tab`（或其描述明确声明本会话不可用并给出降级
  路径）；普通 agent 会话的 `browser_tab` 行为不变。

## 必须保持

- 普通会话（非团队成员）`browser_tab` 可用性不受影响；
- 剔除若基于会话类型判定，判定必须来自会话角色/binding 而非字符串启发式；
- 工具清单变化后成员系统提示词的工具段与实际注册保持一致。

## 测试与验证

- 定向测试：成员会话工具装配的合同/集成测试——团队上下文清单无 `browser_tab`（或描述含
  不可用声明），普通上下文保留；
- 用户流程：无需 UI E2E；定向集成测试即可证明；
- 质量检查：受影响包 `test:pkg` + `check:quick`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：
- 剩余风险：
