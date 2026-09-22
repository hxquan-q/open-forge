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
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0019, TASK-0020, TASK-0021]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# Pi Adapter 评估（implementation-plan 阶段 7，条件触发）

## 目标

仅当下列信号同时出现才启动（ISSUE-0002 已裁决当前不启动，触发条件常设）：

- Vetta Engine 缺少重要能力且无法局部吸收；
- 上游 Pi 能力有明确收益；
- 差分测试基线已存在（TASK-0002 fixture 已就位）；
- Adapter 可独立回退；
- 不需要引入 Pi Session/Harness/Storage；
- 性能、可靠性或维护收益可量化。

## 范围

### 并发评估

- 结论：不支持（触发前只做观察，coordination-only）
- 前置依赖：阶段 1-6 全部落地（差分基线需要完整产品面）
- 集成负责人：coordinator

### 做（触发后）

1. `runtime-core` 增加通用 `createTurnEngine` 注入合同；
2. 新建 Adapter 包，Runtime 不依赖 Pi；
3. 映射消息、工具、Policy、Checkpoint、Abort、Observation、Error；
4. 先在 CLI/测试宿主 A/B；
5. 通过差分和生命周期门禁后才考虑 Desktop 灰度。

### 不做

- Pi 作为生产默认内核；
- Pi 全套 Harness / Extension 兼容层；
- 未经触发条件评审的提前投入。

## Given / When / Then

- Given：触发条件被逐条核实并记录在 ISSUE-0002 更新里；
- When：以 `TurnEnginePort` Adapter 接入 Pi 并在测试宿主跑差分；
- Then：行为合同与生命周期测试全绿、可独立回退、收益量化报告归档 `project/research/`。

## 必须保持

- Vetta Engine 仍是默认内核；
- Adapter 失败可整体摘除，不污染 runtime-core 合同；
- 不引入 Pi Session/Harness/Storage。

## 测试与验证

- 定向：差分行为合同（复用 TASK-0002 fixture 基线）、生命周期回归；
- 质量检查：`bun run check:quick`、全量 check。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
