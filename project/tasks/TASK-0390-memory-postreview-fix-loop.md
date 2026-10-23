---
id: TASK-0390
type: task
status: verifying
priority: P1
owner: runtime-node / coding-agent / desktop
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求修复 VERIFY-0022 复核问题并完成入口闭环（2026-10-23）
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0371, TASK-0375, TASK-0376, TASK-0379, TASK-0380, TASK-0382]
related_issues: []
related_bugs: [BUG-0147, BUG-0148, BUG-0149, BUG-0150]
execution: serial
branch: main
worktree: 主工作区（serial）
base_commit: e11ac2e22
read_paths:
  - AGENTS.md
  - project/verification/VERIFY-0022-memory-postimplementation-review.md
  - packages/runtime-node/src/memory
  - packages/coding-agent/src/memory
  - apps/desktop/src/main/memory
  - apps/desktop/src/main/agent-runtime/composition.ts
  - apps/desktop/src/main/conversations
write_paths:
  - packages/runtime-node/src/memory
  - packages/runtime-node/test/memory
  - packages/coding-agent/src/memory
  - packages/coding-agent/test/memory
  - apps/desktop/src/main/memory
  - apps/desktop/src/main/agent-runtime/composition.ts
  - apps/desktop/src/main/conversations
  - apps/desktop/test
  - scripts/evals/memory
  - project/bugs/BUG-0147-memory-store-identity-and-id-authorization.md
  - project/bugs/BUG-0148-memory-policy-not-in-normal-sessions.md
  - project/bugs/BUG-0149-memory-capture-and-hybrid-not-wired.md
  - project/bugs/BUG-0150-memory-tautology-and-eval-scoring.md
  - project/tasks/TASK-0390-memory-postreview-fix-loop.md
  - project/verification/VERIFY-0022-memory-postimplementation-review.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/tasks/README.md
  - project/bugs/README.md
exclusive_paths:
  - packages/runtime-node/src/memory/worker
  - packages/runtime-node/test/memory/postreview-isolation.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-23
updated: 2026-10-23
---

<!-- Copyright The Open Forge contributors. -->

# 记忆交付后复核修复与正常入口闭环

## 目标

关闭 [VERIFY-0022](../verification/VERIFY-0022-memory-postimplementation-review.md) 的 R1–R6，并完成正常产品入口的验证闭环：完整作用域隔离、按 ID 授权、lease 授权分离、策略进入普通会话、自动捕获与混合检索生产接线、恒真断言与评测计分修复。

## 范围

- R1/R2/R3（BUG-0147）：存储身份落库与迁移、按 ID 归属核验、lease 授权分离；词法/向量派生层授权过滤前移到 limit 之前。
- R4（BUG-0148）：宿主读取保存策略注入普通新建/恢复。
- R5（BUG-0149）：捕获 observer/队列消费/抽取提交接线；工具与上下文走混合检索与注入预算（user+project 合并、无模型降级词法）。
- R6（BUG-0150）：恒真断言、评测目标命中计分、正常 Session 装配级验证。

## 不做

- 不推进双时态、经验演化、图检索、插件兼容。
- 不调用真实 Provider、不下载模型、不操作真实用户数据库或运行中的 Desktop。
- 不推送或发布；本地原子提交与本地集成。

## 验收（最低流程）

临时目录 + 合成数据证明：A 记住→仅授权 B 重开不可读改删；user/project 更正保持归属；A/B 并发不继承授权；设置启用→普通新建→记住→退出恢复→召回；automatic 事件→队列→抽取→提交→召回；user+project 共同进入有界上下文；遗忘期间旧任务/向量/缓存不复活；无模型/失败/取消明确降级且主 Turn 语义不变。

## 交付记录

- 实际修改（2026-10-23）：
  - R1/R2/R3：worker-source schema v2（完整身份列+迁移+索引；旧行空身份隔离）；read/correct/forget/listRevisions/listSources 归属核验，correct 继承存储身份；memory-worker 通道/授权视图分离（authScopes 随请求、lease 不继承）；lexical-index 身份列重建+授权在候选 limit 前；vector-store/embedding-jobs 身份列；erasure undo 身份传播；migrations 声明 v2。
  - R4：apps/desktop policy-entry（读保存策略/automatic 缺模型降级 explicit/显式优先）接入 desktop-conversation-service 唯一 resolve 路径（新建/恢复共用）；control-service readPolicy 复用、forget 归属核验。
  - R5：coding-agent session-assembly（可移植存储端口+混合检索+合并 user/project 证据注入+automatic 捕获/消费/启动补偿）+ merged-evidence + runtime-node session-storage-adapter；desktop composition 委托共享装配。
  - R6：memory-user-flow 恒真断言删除+真否定；run-deterministic 按 expectedMemoryId+当前内容计分；新增 postreview-isolation（5 例）与 session-entry-flow（3 例，正常 Session 装配验证下一模型请求）。
- 实际运行：runtime-node test/memory 63/63、coding-agent test/memory 49/49、desktop src/main/memory 12/12、根 tsgo 0 错、bun run check 全绿（lint/types/guards/mobile）、eval runner correction 场景冒烟（目标命中计分）。
- 未运行：真实 Desktop UI 实机、真实 Provider/embedding 质量、打包/跨平台（未授权/无环境，如实未验证）。
- 遗留限制：e5 候选 checksum 未钉住（授权下载后回填）；automatic 生产抽取端口为「未配置」明确失败（真实 Provider 授权后替换）；erasure↔向量清理联动时机待 0382 消费方复核。
- 集成：本地 main 串行提交；不推送。

