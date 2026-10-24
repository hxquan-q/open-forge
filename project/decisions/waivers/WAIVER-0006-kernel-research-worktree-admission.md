---
id: WAIVER-0006
rule: project/collaboration/development-workflow.md — 全量 worktree:check 严格历史台账准入
status: active
owner: PLAN-0024-coordinator
reason: main 基线 TASK-0344–0347 缺 created/updated，修复无关历史记录会扩大本轮内核优化范围；主检出存在他人未提交文件，不能夹带清理
risk: 全量协调者严格门禁仍失败，不能宣称全仓台账或集成条件满足
compensation: 仅允许 TASK-0394–0397 隔离调查/编码；登记所有当前写范围冲突，每个代码 Task 创建后须通过目标 worktree:check；不放宽代码测试或完整 check，不推送或强行集成脏 main
created: 2026-10-23
expires: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 内核优化隔离实施的历史台账准入例外

2026-10-23 于 main@ea67d951e 执行 `bun run worktree:check --all` exit 1：TASK-0344、0345、0346、0347 均缺 created/updated；另有历史已删除 Worktree 警告和 TASK-0154/0395 的静态前缀范围重叠。0395 已补 `conflicts_with: TASK-0154`，0154 标为 integrated 且该 Worktree 不在本机；本轮不操作其文件或重写其状态。

例外只涉及全量旧管理记录阻塞隔离 Task 创建这一 Policy，不豁免依赖/权限/Git 安全/测试不变量。目标 Task 合同、分支、绝对目录、实际写范围需逐个核对。最终完整检查如有失败应记录并保持 verifying/blocked，不能借此 waiver 声称通过。历史日期应由对应 owner 核实真实时间后修复，不倒填。
