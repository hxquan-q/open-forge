---
id: WAIVER-0013
rule: project/collaboration/development-workflow.md 的全量 worktree:check 严格历史台账准入
status: active
owner: PLAN-0026-coordinator
reason: 052192d45 基线 TASK-0344–0347 缺 created/updated，历史日期须由对应 owner 核实；不扩大本轮运行时任务为历史台账维护
risk: 全量协调者台账门禁仍失败，不能宣称全仓历史工作树均有效
compensation: 仅覆盖 TASK-0410/0411 的隔离创建；全量预检无写域冲突，每个目标创建后须通过 worktree:check，代码测试与完整 check 不豁免，不夹带或清理历史工作树
created: 2026-10-28
expires: 2026-11-04
---
<!-- Copyright The Open Forge contributors. -->

# 资源准入实施的历史台账前置例外

2026-10-28 `bun run worktree:check --all` exit 1：TASK-0344–0347 各缺两项日期；另有历史未注册目录 warning，没有本批实现写域冲突。根静态 Task/Project 守卫通过。与 WAIVER-0006 的历史问题相同，但该条只覆盖 PLAN-0024，本条按当前批次单独登记，不扩张旧授权。

允许 Coordinator 在干净主检出中以标准 CLI 为两个新 Task 创建隔离工作树并按各自合同实施/审查/集成。目标检查、真实 Git 归属、所有权、取消/隐私、测试、完整 check 和发布授权均不豁免；不把全量预检失败记成通过。到期不自动续期。
