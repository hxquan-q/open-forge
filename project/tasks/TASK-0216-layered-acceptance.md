---
id: TASK-0216
type: task
status: in_progress
priority: P2
owner: coordinator
source: user-request（「验收方式」决策：分层）
related_requirement: []
related_plan: []
related_tasks: [TASK-0214]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: c2931b2e3
read_paths: [project/tasks, project/tasks/README.md]
write_paths: [project/tasks, project/tasks/README.md, project/verification]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 分层验收：闭合工程合同面并产出行为面验收清单

## 目标与范围

用户在「剩下 72 个 verifying 条目怎么验收」上选择了分层：产品行为面由用户试用，纯工程合同面由 Agent 按工程证据闭合（记录写明是按用户授权，不是用户已确认）。本 Task 落实这条决策。

分类判据只有一条，避免逐案猜测：**改动是否会改变用户可观察的输出、界面、交互、安装或更新流程、AI 行为**。会，属行为面，保持 `verifying` 并进入验收清单；不会，属合同面——验收对象是测试、守卫、契约或台账本身——按既定标准闭合。

分类结果：合同面 17 个（0137、0138、0139、0140、0141、0164、0150、0173、0174、0175、0182、0187、0196、0198、0199、0205、0206），行为面 53 个，另有 2 个（0183、0184）既非内部也无完整验证——它们的 CI 复跑仍受 ISSUE-0029 的 Actions 预算阻塞，单独标注不闭合。

做：闭合合同面 17 个并在记录里写明授权依据；把行为面 53 个整理成验收清单（`project/verification/`），标明看什么、入口与预期。

不做：不闭合任何行为面条目；不闭合工程验证尚未完成的 0183、0184；不把「按用户授权」写成「用户已确认」。

## Given / When / Then

- Given 某条目改动不改用户可观察输出；When 其既定验收标准已实际执行通过；Then 按既定标准闭合，记录注明授权来源。
- Given 某条目会改变用户可观察行为；When 用户尚未反馈；Then 保持 `verifying`，只在验收清单里出现。

## 必须保持

- 每条闭合都要有证据，不靠推断；看不到「无用户可观察行为变化」证据的，一律归行为面。
- 不减少任何记录里的未运行项与剩余风险。

## 测试与验证

- `bun run check`（含索引一致性）。
- `gh api` 无关；本轮不涉及仓库设置。

## 交付记录

待实施。
