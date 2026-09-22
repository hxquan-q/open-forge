---
id: TASK-0019
type: task
status: draft
priority: P2
owner: coding-agent/apps-desktop/runtime-node
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
write_paths: [packages/coding-agent, apps/desktop, packages/runtime-node]
exclusive_paths: []
depends_on: [TASK-0017]
conflicts_with: [TASK-0017, TASK-0018]
integration_status: pending
created: 2026-09-23
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
- 前置依赖：TASK-0017（模式骨架）；建议同时已合入 TASK-0016（风险分级依赖）
- 集成负责人：coordinator

### 做

- Project Context 组装与 Profile 展示；
- 写文件默认走 Diff 而非静默覆盖；Diff/Patch Review 面板；
- Git 操作按只读/写入分级接入 Approval；Shell 落 Sandbox 边界；
- 测试输出落 `execution-result` Artifact；coding Activity Panel tab。

### 不做

- 远程 Task 调度、团队协作（MVP 排除）；
- 新 Diff 引擎（复用现有 diff 渲染）。

## Given / When / Then

- Given：coding 模式下一个已选项目；
- When：Agent 修改文件并运行测试；
- Then：修改以 Diff 呈现供 Review、Shell 走沙箱、Git 写操作需审批、测试结果作为 Artifact 可查看、Activity Panel 显示完整轨迹。

## 必须保持

- 修改文件默认产生 Diff，不静默覆盖；
- L4 操作在任何 Trust 状态下都需确认；
- coding 工具集不外溢到 work。

## 测试与验证

- 定向：Diff/Review 流程测试、Git 风险分级合同测试、Test Artifact 投影测试；
- 用户流程：改码 → Diff → 测试 → Review 闭环；
- 质量检查：`bun run check:quick`、相关包全量测试。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
