---
id: TASK-0412
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: BUG-0156（TASK-0407 报告 F09）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0407, TASK-0404]
related_issues: []
related_bugs: [BUG-0156]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 457623095
read_paths:
  - apps/desktop/src/main/conversations
  - apps/desktop/src/renderer/domains/project
  - apps/desktop/src/preload/api-types/session.ts
write_paths:
  - apps/desktop/src/main/conversations/conversation-list-events.ts
  - apps/desktop/src/main/conversations/desktop-conversation-service.ts
  - apps/desktop/src/main/conversations/desktop-conversation-service.test.ts
  - apps/desktop/src/preload/api-types/session.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx
  - project/tasks/TASK-0412-incremental-coding-sidebar-leak.md
  - project/tasks/README.md
  - project/bugs/BUG-0156-incremental-coding-sidebar-leak.md
  - project/bugs/README.md
  - project/plans/PLAN-0026-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0156-incremental-sidebar-leak.md
exclusive_paths:
  - apps/desktop/src/main/conversations/conversation-list-events.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# coding 增量行侧栏漏过滤修复（BUG-0156）

## 目标

sessions-changed 增量路径与全量刷新同口径：coding 会话的即时插入不落入普通侧栏。`agentMode` 自主进程事件载荷起端到端透传，渲染端增量插入保留该字段；投影对无记录历史会话的 work 兼容语义不变。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0026 第 5 片，主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：`conversation-list-events.ts` 独占；其余为同文件追加。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0026 第 5 片。

### 做

1. `ConversationListChangedEvent.session` 增可选 `agentMode?: string`；runTurn 首条消息分支带上 `options.session.agentMode`。
2. preload `onSessionsChanged` 载荷类型同步。
3. `useProjects` 增量插入新条目时拷贝 `agentMode`（已有条目 spread 天然保留）。
4. 主进程红测试（runTurn 事件载荷）与渲染端红测试（插入保留字段 + 投影过滤/放行）。

### 不做

- 不收紧投影对缺标记的 work 兼容（保护无记录历史会话）；
- 不改全量刷新/防抖调度与 listSessions 批量下发；
- 不给无载荷发射点（auto-title、归档等）补 session 载荷。

## Given / When / Then

- Given coding 档会话首条消息，When runTurn 发射列表变更，Then 事件 `session.agentMode === "coding"`。
- Given 渲染端收到带 agentMode 的 coding 增量事件，When 插入 sessionsMap，Then 条目带 `agentMode` 且普通投影不含它。
- Given work 载荷（或无标记历史事件），Then 照常进入普通投影。

## 必须保持

- 无 agentMode 的历史事件仍按 work 放行（投影兼容语义）；
- 增量插入的幂等、modifiedAt 合并与防抖重拉不变；
- 其余发射点事件形状不变（字段可选追加，向后兼容）。

## 测试与验证

- 主进程定向：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/conversations/desktop-conversation-service.test.ts`。
- 渲染端定向：apps/desktop 内 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/project/hooks/useProjects.sessionsChanged.test.tsx src/renderer/domains/project/services/sidebar-conversation-projection.test.ts`。
- `check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：不适用（窗口级行为，由单测锁定）。发布：未授权。

## 交付记录

- 实际修改：`conversation-list-events.ts`/`preload api-types/session.ts`（载荷 +`agentMode?`，含声明头补齐）、`desktop-conversation-service.ts` runTurn 首条消息载荷带档位、`useProjects.ts` 增量插入保留档位；新增 `useProjects.sessionsChanged.test.tsx`（2 用例）与 `desktop-conversation-service.test.ts` 追加 runTurn 载荷用例 + 单点 `vi.mock("../ipc/session.js")` 修复套件既有收集断裂；BUG-0156/本 Task/索引与 v0.1.4 fragment。
- 实际运行：主进程套件红 1→绿 17/17；渲染端 12/12（新文件 2 + projectWrites + 投影）；`check:quick` 通过（ratchet new=0）。
- 未运行及原因：完整 check 与 impact 留批次收尾；实机不适用（增量窗口不可稳定人工观察）。
- Worktree：未拆出（主检出串行）。
- 剩余风险：既有断裂修复仅覆盖本套件所需单点；notifications/window-manager 链在其他主进程测试图中的暴露情况未全面排查（范围外，批次汇报）。
