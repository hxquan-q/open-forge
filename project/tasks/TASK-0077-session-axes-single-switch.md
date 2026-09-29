---
id: TASK-0077
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source: ISSUE-0010 scheme B
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/workspace-mode, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main/conversations]
write_paths: [apps/desktop/src/renderer/domains/workspace-mode, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main/conversations, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/shared/i18n/locales]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0070, TASK-0076]
integration_status: pending
created: 2026-09-24
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 单一工作区开关与会话只读徽标

## 目标

落实 ISSUE-0010 方案 B：用户只见页头一个办公/编程开关；新建会话从当前工作区同时派生 `agentMode` 与 `capabilityProfile`；已开会话在输入栏显示只读徽标。

## 范围

### 做

- 新会话页去掉第二套同名 Work/Coding 控件。
- `session.create` 携带派生轴；恢复会话仍读固化记录。
- 输入栏只读徽标展示解释模式与工具集。
- 页头文案改为办公/编程，避免与「工作模式」撞车。

### 不做

- 不重开 ISSUE-0005 三轴合同。
- 不把 `agentMode` 做成权限开关。
- 不在已开会话上热切换工具集。
- 不占用 `TASK-0073`（该编号已被内核上下文稳定性任务使用）。

## Given / When / Then

- Given：页头为办公，已有 coding 会话打开；When：只切页头；Then：当前会话徽标仍是编程，新开会话才带办公默认。
- Given：用户只用页头开关后点新会话；When：进入输入；Then：不再出现第二套同名「工作/编程」必经步骤。

## 测试与验证

- `session-axes.test.ts`、`session-agent-mode.test.ts`、`agent-mode-entry-points.test.ts`、`NewSessionOptionsRow.test.tsx`、`agent-controls.test.tsx`
- `bun run test:impact -- <files>` + `bun run check:quick -- <files>`

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

工作区只保留一处办公/编程开关；当前会话在输入栏显示只读解释与工具集，切换页头不会改写已打开的会话。

## 交付记录

- 实际修改：`session-axes` 派生与徽标、`session.create` 传入双轴、`resolve-session-config` 优先渲染层 agentMode、输入栏只读徽标、新会话行去掉 `AgentModeIconToggle`。
- 实际运行：`session-axes` 4、`session-agent-mode` 8、`agent-mode-entry-points` 7、`NewSessionOptionsRow` 2、`agent-controls` 1，均通过。`check:quick` 对本切片文件通过。
- 未运行及原因：`verify:ui:*` 需用户授权；`bun run check` 全量被工作区其他 Agent 的 WIP 污染，未作为本切片通过条件。
- 剩余风险：`chat-atoms.ts` 同文件含 TASK-0076 一句品牌注释；徽标依赖会话 create/resume 回传 `agentMode`，旧会话无字段时不显示。
