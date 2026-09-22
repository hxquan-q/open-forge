---
id: ISSUE-0002
type: issue
status: done
priority: P2
owner: runtime-core/coding-agent
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
source: exprot/kernel-replacement-feasibility.md
created: 2026-09-22
updated: 2026-09-22
---

# 是否启动 Pi Adapter 评估

## 决策

**暂不启动。** 继续使用 Vetta Agent Engine 作为生产内核；本 issue 关闭，触发条件常设。

## 触发条件（任一不满足即维持现状）

1. Vetta Engine 存在无法局部吸收的重要能力缺口；
2. 上游 Pi 能力有明确收益且收益可量化；
3. 差分测试基线已存在（TASK-0008 交付的合同 fixture 是前提之一）；
4. Adapter 可独立回退，不引入第二套 Pi Session/Harness/Storage；
5. 性能或维护收益可量化。

当前五项均不满足：TASK-0002/0008 已把 Provider 流与 Task 合同钉成可回归基线，PLAN-0002 的可靠性缺口已由
TASK-0003~0007 与 BUG-0001~0003 收敛，无证据表明存在必须换内核才能解决的能力缺口。

## 不做

不引入第二套 Pi Session、Harness、Storage 或并行 Runtime。若未来触发条件出现，按 `implementation-plan.md`
阶段 7 的顺序重启评估（`createTurnEngine` 注入合同 → 独立 Adapter 包 → CLI/测试宿主 A/B → 门禁 → 灰度）。
