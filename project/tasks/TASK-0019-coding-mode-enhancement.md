---
id: TASK-0019
type: task
status: ready
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
write_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
exclusive_paths: []
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024]
conflicts_with: [TASK-0017, TASK-0018]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---

# coding 模式增强（implementation-plan 阶段 4）

## 目标

在 coding 入口上交付：Project Context/Profile、Diff/Review 工作流、
Git 只读与写入的风险分级、Shell Sandbox 边界、Test Result Artifact、
coding Activity Panel、Tool/MCP deferred visibility。

## 范围

### 并发评估

- 结论：不支持并发（与 work 骨架改同一批 Profile/UI 入口文件）
- 执行方式：serial
- 前置依赖：TASK-0015（Task/Artifact projection）、TASK-0016（Risk/Approval/Sandbox policy）、TASK-0017（Profile）、TASK-0024（Shell/Activity 面板插槽）
- 集成负责人：coordinator

### 做

- Project Context 组装与 Profile 展示；
- 写文件默认走 Diff 而非静默覆盖；Diff/Patch Review 面板；
- Git 操作按只读/写入分级接入 Approval；Shell 落 Sandbox 边界；
- 测试输出落 `execution-result` Artifact；将 coding 专属信息接入 TASK-0015 的共享 Activity Panel 插槽，不另建第二套 Task 状态面板。

### 不做

- 远程 Task 调度、团队协作（MVP 排除）；
- 新 Diff 引擎（复用现有 diff 渲染）。

## Given / When / Then

- Given：用户在 coding 布局中打开已选项目；
- When：Agent 修改文件、用户审查 Diff、运行测试，并尝试一项 Git 写操作；
- Then：Diff 可审查并接受/拒绝，Shell 经既有 Sandbox，Git 写操作依 TASK-0016 风险合同审批，测试结果作为 Artifact 出现在共享 Activity Panel；拒绝审批不会执行副作用。

## 必须保持

- 修改文件默认产生 Diff，不静默覆盖；
- L4 操作在任何 Trust 状态下都需确认；
- coding 工具集不外溢到 work。

## 测试与验证

- 定向：Diff/Review 接线测试、Git 写操作经真实 Tool Policy 拒绝/批准测试、Test Artifact projection 测试；
- 用户流程：选项目 → 改码 → 审查 Diff → 运行测试 → 审批 Git 写入或拒绝 → 查看 Artifact/Activity；
- 质量检查：`bun run check:quick`、相关包全量测试。

## 阻塞

- ISSUE-0005 尚未冻结 WorkspaceMode、会话 `agentMode` 与 capability profile 的关系；本 Task 不自行引入 mode 级权限过滤。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
