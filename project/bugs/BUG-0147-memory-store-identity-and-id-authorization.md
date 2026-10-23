---
id: BUG-0147
type: bug
status: fixed
priority: P1
owner: packages/runtime-node
source: VERIFY-0022 R1/R2/R3（2026-10-23 复核复现）
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0027]
related_tasks: [TASK-0390]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 记忆存储身份未落库、按 memoryId 操作无归属核验、共享 lease 继承授权

## 现象与复现

[VERIFY-0022](../verification/VERIFY-0022-memory-postimplementation-review.md) 用合成数据在临时库复现：A 项目写入并关闭后，仅授权 B 重新打开，B 能读到 A 的内容且跨项目 correct 返回 saved。词法/向量派生索引同样只按 scope_name 过滤；`acquireMemoryStoreLease` 按 DB 路径复用 store，第二个 lease 继承首个会话的 allowedScopes（源码确认，未跑复现）。

## 根因

- `worker-source.ts` schema v1 只存 scope_name/visibility，未存 principalId/projectId/workspaceViewId；read/listRevisions/correct/forget 均不核验数据行归属。
- `memory-worker.ts` lease 池按路径复用整个 store（含 open 时的授权集合）。
- 词法索引与向量表的检索在候选 limit 之后才做授权过滤，或根本不做。

## 修复合同

- 完整身份（principalId/projectId/workspaceViewId）随修订落库；读/写/FTS/向量/来源/后台任务一致使用。
- correct/forget/listRevisions/listSources 核验目标真实归属；correct 保持原作用域（新修订继承存储身份），显式迁移另立操作。
- 授权过滤发生在候选 limit 之前。
- 旧记录（身份列为空）明确隔离：不进入任何具名 scope 的读写，不猜测项目、不自动提升全局；后续显式迁移另行处理。
- 共享数据库资源与每次调用授权分离；lease 不继承他人授权；覆盖并发首次打开、不同 owner、释放重开与初始化失败回收。

## 回归要求

可失败复现：A 写入→关闭→仅授权 B 重开：B 不可读、改、删 A；user 与 project 更正保持归属；A/B 同时活跃互不继承授权；旧行隔离。

## 处置记录

- 2026-10-23：TASK-0390 修复完成——存储身份落库（schema v2）、按 ID 归属核验、lease 授权视图分离、词法/向量授权前置到候选 limit 之前、旧行空身份隔离；回归见 runtime-node test/memory/postreview-isolation.test.ts 与 worker-lifecycle（63 例全绿）。
