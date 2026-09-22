---
id: REQ-0001
type: requirement
status: draft
priority: P1
owner: product/runtime
source: exprot/mvp-scope.md
related_plan: [PLAN-0001]
created: 2026-09-22
updated: 2026-09-22
---

# work/coding 本地 Desktop MVP

## 目标

为个人专业用户和小团队提供本地优先的 `work` / `coding` 双入口，共享已有 Runtime、Session、TurnPipeline、Snapshot 和权限基础设施。

## 范围

- `work`：文档、文件批处理、研究/知识库、数据分析。
- `coding`：代码、Git、Shell、测试、MCP。
- Task、Artifact、Permission、Review 作为产品层能力逐步接入。

## 不做

- 第二套 Agent Loop 或 Task Runner。
- 独立 Artifact 数据库。
- 仅存在 Renderer 内存中的最终 Task 状态。
- 云端执行、云端会话同步和多租户 SaaS。

## 验收入口

具体范围、用户流程和排除项以 [`exprot/mvp-scope.md`](../../exprot/mvp-scope.md) 为当前研究基线；实施前必须同步检查源码、类型和现有测试。
