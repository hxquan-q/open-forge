---
id: TASK-0078
type: task
status: in_progress
priority: P1
owner: apps/desktop main/conversations + agent-teams
requirement: REQ-0004
plan: PLAN-0001
source: code review 修复批（3 个 finder 独立命中；修复 TASK-0077 引入的固化语义缺陷与团队暴露面）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/conversations/resolve-session-config.ts, apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.ts, project/tasks/TASK-0077-session-axes-single-switch.md]
write_paths: [apps/desktop/src/main/conversations/resolve-session-config.ts, apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.ts, apps/desktop/src/main/conversations/resolve-session-config.test.ts]
exclusive_paths: [apps/desktop/src/main/conversations/resolve-session-config.ts, apps/desktop/src/main/agent-teams/team-runtime-manager.ts]
depends_on: [TASK-0077]
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# capabilityProfile 固化语义修复与团队工具面裁决

## 根因（finder 交叉确认）

1. **resume 重派生**：`useSessionOpener` 在 `sessionPath` 存在（恢复）时也无条件把 `deriveSessionAxesFromWorkspaceMode(currentWorkspaceMode)` spread 进 `session.create`；`resolve-session-config.ts:131` 对 `capabilityProfile` 不做 `existingSessionPath` 守卫（`agentMode` 有）。结果：coding 工作区创建、用户切到 work 后重开的会话，固化 profile 被静默改成 work 工具子集——违反字段自己的「固化于创建、恢复回落」合同。
2. **团队暴露面**：`team-runtime-manager.ts:86/:122/:273`（成员新会话、协调 Runtime 新建+恢复、成员恢复）从不传 `capabilityProfile`，新回退 `agentMode === "work" ? work : coding` 生效；团队会话绕过 `desktop-conversation-service.createSession`（agent-modes.json 永不落盘），`agentMode` 恒走 `work` 回退 → **全体团队成员/协调 Runtime 被切到 WORK_PROFILE（bash/shell 等代码工具被排除）**，首次创建与每次恢复都命中，无用户可见提示。

## 裁决依据

团队成员是委派合同的**执行者**（TASK-0069：自包含任务书、实现并自验证），leader 编排、成员干活——成员没有全量工具面就无法完成实现与验证。静默收窄无产品依据。团队三处显式 `capabilityProfile: "coding"`。

## 做

1. `resolve-session-config.ts`：`existingSessionPath` 存在时 `capabilityProfile` 与 `agentMode` 同样守卫（不采纳请求值，维持 `resolveAgentProfile(undefined)` 的 coding 缺省或读会话存储的固化值——以现仓库可拿到的存储面为准，选实现代价小且合同自洽的一种）。
2. `useSessionOpener.ts` resume 分支：不再把当前 workspace 模式的 axes spread 进 create（或存储值优先）。
3. `team-runtime-manager.ts` 三处显式 `capabilityProfile: "coding"`，注释写明裁决依据。
4. 顺带核对 debug（`app-debug/conversation/definitions.ts`）、remote-control、IM host 调用方：缺省语义应为 coding（不收紧），若被新回退改变则同样显式化。

## Given / When / Then

- Given coding 工作区创建的会话、用户已把页头切到 work，When 重开该会话，Then 工具面仍是 coding（固化不被重派生）。
- Given 任意团队，When 创建/恢复成员与协调 Runtime，Then resolve 出 CODING profile（bash 可用）。
- Given 未传 capabilityProfile 的既有调用方（debug/remote/IM），When 创建会话，Then 工具面与改动前一致（不收紧）。

## 测试与验证

- `resolve-session-config.test.ts`：resume 不受当前 workspace 模式影响；新会话照常。
- team-runtime-manager 相关测试：三处创建/恢复路径传 coding（或断言 resolve 结果）。
- 命令：desktop 定向测试从 apps/desktop 目录用 `bun ../../scripts/quality/run-vitest.mjs --run <file>`；`bun x tsc --noEmit -p tsconfig.json` 只看本任务文件。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】重开已有会话不再被当前工作区模式改写工具面；团队成员智能体恢复完整工具集。
