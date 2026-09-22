---
id: ISSUE-0002
type: issue
status: draft
priority: P2
owner: runtime-core/coding-agent
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
source: exprot/kernel-replacement-feasibility.md
created: 2026-09-22
updated: 2026-09-22
---

# 是否启动 Pi Adapter 评估

## 当前结论

暂不把 Pi 作为生产默认内核，继续使用 Vetta Agent Engine。

## 触发条件

只有当 Vetta Engine 存在无法局部吸收的重要能力缺口，且差分测试、Adapter 回退、性能和维护收益都可量化时，才启动评估。

## 不做

不引入第二套 Pi Session、Harness、Storage 或并行 Runtime。
