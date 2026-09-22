---
id: TASK-0022
type: task
status: blocked
priority: P3
owner: runtime-core
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0002
execution: coordination-only
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, exprot/kernel-replacement-feasibility.md]
write_paths: []
exclusive_paths: []
depends_on: [TASK-0002, TASK-0008]
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# Pi Adapter 评估（implementation-plan 阶段 7，条件触发）

## 目标

本 Task 只负责只读评估是否满足 ISSUE-0002 的启动条件；不接入 Pi、不改 Runtime API。
当前决策为暂不启动，只有证据显示以下条件全部满足才重新评审：

- Vetta Engine 缺少重要能力且无法局部吸收；
- 上游 Pi 能力有明确收益；
- 差分测试基线已存在（TASK-0002 fixture 已就位）；
- Adapter 可独立回退；
- 不需要引入 Pi Session/Harness/Storage；
- 性能、可靠性或维护收益可量化。

## 范围

### 并发评估

- 结论：不支持（触发前只做观察，coordination-only）
- 前置依赖：TASK-0002 与 TASK-0008 的合同基线；是否需要额外产品流程基线由评估结论列明
- 集成负责人：coordinator

### 做（条件触发后，只做评估）

1. 逐条收集 ISSUE-0002 的第一方证据和当前 Vetta Engine 基线；
2. 将可量化收益、无法局部吸收的能力缺口及回退边界写入 `project/research/`；
3. 更新 ISSUE-0002 的决策状态；若评估批准接入，另建代码 Task 冻结 owner、公开合同、Adapter 包和测试矩阵。

### 不做

- Pi 作为生产默认内核；
- Pi 全套 Harness / Extension 兼容层；
- 未经触发条件评审的提前投入。

## Given / When / Then

- Given：外部/源码证据显示 ISSUE-0002 的所有条件可能满足；
- When：只读评估并将结论、差分基线缺口与收益证据归档；
- Then：ISSUE-0002 更新为启动或维持不启动，若启动则另建实现 Task；本 Task 不修改生产执行路径。

## 必须保持

- Vetta Engine 仍是默认内核；
- Adapter 失败可整体摘除，不污染 runtime-core 合同；
- 不引入 Pi Session/Harness/Storage。

## 测试与验证

- 验证：复核 TASK-0002 Provider 流 fixture 与 TASK-0008 Task 合同的覆盖边界；若不足，列为新实现 Task 的前置验证，不声称其已构成 Turn Engine 差分基线；
- 本 Task 不改代码，不运行代码测试；核对研究链接与 ISSUE-0002 更新即可。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
