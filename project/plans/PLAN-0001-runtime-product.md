---
id: PLAN-0001
type: plan
status: ready
priority: P1
requirement: REQ-0001
owner: runtime-core/coding-agent/desktop
source: exprot/implementation-plan.md
created: 2026-09-22
updated: 2026-09-22
---

# work/coding Runtime 产品演进

## 路线

```text
阶段 0：合同冻结
  → 阶段 0.5：性能与可靠性基线
  → 阶段 1：Task/Artifact 最小纵向切片
  → 阶段 2：Permission/Approval
  → 阶段 3：work 模式
  → 阶段 4：coding 模式增强
```

## 硬约束

Task 不创建第二套 Agent Loop；Artifact 不创建第二套文件事实源；Permission/Approval 不依赖 Prompt；Renderer 不持有最终状态。

详细阶段、Owner 和禁止事项以 [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md) 为研究来源。
