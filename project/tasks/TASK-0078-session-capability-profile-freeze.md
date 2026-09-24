---
id: TASK-0078
type: task
status: done
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
integration_status: integrated
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

- 实际修改（3 源文件 +67/−15，2 新测试）：
  - `resolve-session-config.ts`：`resolveSessionAgentMode` 同时返回 `{ agentMode, frozenAgentMode }`（记录是否存在）；新增 `resolveSessionCapabilityProfile`——恢复会话且有固化记录时按记录折算、**不采纳请求值**（堵渲染层把「当前页头」派生值随 resume 下发），无记录/新建时显式请求优先、缺省回落 coding。一并修掉旧回退（`agentMode === "work" ? "work" : "coding"`）对 debug/remote-control/新会话缺省方的静默收紧；无记录历史会话按 coding 恢复，与 0077 之前所有恢复路径拿 CODING 对齐。
  - `useSessionOpener.ts`：resume 分支不再把 `deriveSessionAxesFromWorkspaceMode` spread 进 `session.create`，仅 `sessionPath === undefined`（新建）时下发——主进程守卫成为双保险。
  - `team-runtime-manager.ts`：模块级 `TEAM_CAPABILITY_PROFILE = "coding"` 裁决常量（成员/协调 Runtime 是 TASK-0069 委派合同执行者，须保全量工具面；团队会话绕过 desktop-conversation-service、agent-modes.json 永不落盘），`createMemberRuntime` / `createCoordinationRuntime`（新建+恢复）/ `resolveMemberSessionConfig` 三处显式传入。
  - 新建 `resolve-session-config.test.ts`（6 测试）+ `team-runtime-manager.test.ts`（4 测试）：固化 coding 不被改写、固化 work 不被放宽、缺省回落不收紧、无记录恢复不收窄、团队三路径显式 coding。
- 实际运行：定向 3 文件 18/18 + 回归 4 文件（desktop-conversation-service / team-session-service / team-session-concurrency / useSessionManager.session-switch）95/95（主线复跑）；Biome 5 文件零问题；desktop 全量 tsc 对本任务文件零命中。
- 未运行及原因：`verify:ui:*` 需用户授权；全量 `bun run check` 混入并行任务在途文件噪声，以定向 Biome + 定向 tsc 过滤替代。debug/remote-control 调用方核对为不传 capabilityProfile（回落 coding，与 0077 前一致，无需改动）；IM host 会话由 Go sidecar 直连 Runtime，不经本 resolve 路径。
- 剩余风险：无记录会话对显式请求值仍采纳（现仓库 resume 调用方均已核对不传，风险仅在未来新调用方）；capabilityProfile 恢复值从 agentMode 记录折算，依赖创建时两轴同源，若日后解耦需独立落盘；团队裁决依赖「绕过 conversation-service」持续成立，裁决注释已写明该耦合；`plugin-official-sessions` 工具面由 work 还原为 coding（符合「不收紧」裁决的可感知行为变化）。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】重开已有会话不再被当前工作区模式改写工具面；团队成员智能体恢复完整工具集。
