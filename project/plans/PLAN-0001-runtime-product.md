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

## 任务分解（2026-09-23）

- TASK-0015 阶段 1：Task/Artifact 最小纵向切片（ready，依赖 TASK-0008）
- TASK-0016 阶段 2：Permission/Approval L0-L4 与 Project Trust（draft）
- TASK-0017 阶段 3a：work 模式骨架 + 文档处理入口（draft）
- TASK-0018 阶段 3b：work 批处理/研究/数据分析入口（draft）
- TASK-0019 阶段 4：coding 模式增强（draft）
- TASK-0020 阶段 5：共享项目目录约定（draft）
- TASK-0021 阶段 6：Plugin/Skill/MCP/Renderer 生态分层收口（draft）
- TASK-0022 阶段 7：Pi Adapter 评估（blocked，ISSUE-0002 触发条件常设）

跨阶段 UI/UX 线（`exprot/ui-information-architecture.md`）：

- TASK-0023：双模式 IA 与 Activity/Approval/Artifact 面板交互设计定稿（coordination-only）
- TASK-0024：Desktop IA 骨架落地——Mode Switcher、双布局容器、面板插槽与空/错/取消态（串行，独占 root-layout）
