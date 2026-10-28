---
id: TASK-0411
type: task
status: in_progress
priority: P1
owner: runtime-subagents/coding-agent
requirement: REQ-0002
plan: PLAN-0026
source: user-request; RESEARCH-0047
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0411-subagent-admission-observation
worktree: unassigned（待创建）
base_commit: 052192d4568039ff9d304ee9b704f5db83553154
read_paths: [packages/runtime-subagents/, packages/coding-agent/, packages/runtime-core/src/observation/, docs/adr/0087-tool-catalog-generations-and-subagent-observation-boundary.md, project/]
write_paths: [packages/runtime-subagents/src/contracts.ts, packages/runtime-subagents/src/subagent-dispatcher.ts, packages/runtime-subagents/src/subagent-pool.ts, packages/runtime-subagents/src/subagent-run.ts, packages/runtime-subagents/src/scheduling-observation.ts, packages/runtime-subagents/test/coordinator-admission-observation.test.ts, packages/runtime-subagents/test/support/fixture.ts, packages/runtime-subagents/README.md, packages/coding-agent/src/composition/subagent/runtime.ts, packages/coding-agent/src/composition/subagent/session-assembly.ts, packages/coding-agent/src/runtime-contracts/subagent-observability.ts, packages/coding-agent/test/composition/subagent-admission-observation.test.ts]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 子代理准入、排队与收尾释放的安全观测

## 目标

从现有子代理正常入口观察为何等待/拒绝、等待多久、何时准入以及何时释放逻辑调度槽，明确收尾宽限耗尽；不改变持久快照、队列行为或并发默认值。

## 范围

### 并发评估

- 结论：条件支持，与 TASK-0410 写域独立；execution parallel，Coordinator 在独立 Task Worktree 写入。
- Branch：`task/TASK-0411-subagent-admission-observation`；Worktree 由仓库 CLI 创建；前置依赖无；最终集成 0410 → 0411。
- 共享 Project/发布索引仅 Coordinator 在主检出维护；不改 0410 的 OCR policy/peripheral 或 runtime-tools 导出。

### 做

- 在 runtime-subagents 公开 options 增加可选安全 scheduling callback，使用类型化事件记录 queued/admitted/rejected/settling/released 和收尾 deadline；只带 parent/child id、generation、计数、等待/持有时长和稳定 reason。
- 使用调度器当前 owner 与 clock，安全隔离 callback 错误；不对每次快照更新全历史扫描，不把提示词/task/title/路径/错误正文纳入事件。
- CodingAgentSubagentRuntime 转发 callback，session assembly 接入既有 observationPublisher，内核保持零 workspace 依赖。
- 保留 BUG-0001 的默认 10 秒有界收尾；释放原因明确区分正常完成和宽限到期，不能声称逻辑槽释放证明真实 Provider/Tool 退出。

### 不做

不改变默认 3、spawn/followUp 满额拒绝、workflow FIFO、通知恰好一次、generation/恢复/持久化或 Team 权限；不修改 UI/Prompt，不添加新全局 Agent 调度器。

## Given / When / Then

- 一项正在运行、批量后续等待 → 前项完成 → queued/admitted/released 事件顺序、计数与等待时长符合真实行为，后项按 FIFO 启动。
- 单次 spawn 满额 → 拒绝 → 记录容量原因且不创建/泄漏子代理；后续请求仍可用。
- 排队项取消 → 事件 → 从未启动；中断活跃项尚未 idle → 不提前归还逻辑槽，直至正常 settled 或原有收尾宽限到期。
- 子操作忽略 abort/idle → fake clock 推进 10 秒 → 记录 deadline 与释放原因，后续队列继续，dispose 有界。
- 观察回调抛错、恢复后 followUp、身份 rekey → 正常操作 → 业务/交付不变，事件身份与 generation 正确，无私有内容泄露。

## 必须保持

所有原角色、工具/usage/stop、错误、取消、通知与持久化语义；runtime-subagents 仍无 workspace 依赖；默认和公共工具 Schema 不变。

## 测试与验证

- 定向：公开 coordinator 连续流程 + Coding Agent 产品组装 observation；显式 deferred/fake clock，无任意 sleep。
- 现有 API/scheduling/terminal-state/recovery/shutdown/delivery 测试作为兼容基线；`test:impact`、跨包 `test:changed`、`check:quick`、完整 `bun run check`。
- 新观测先红后绿；没有真实 Provider/UI 验证权限，不把 Fake 运行称为真实模型性能测试。

## 验收分层

- 工程验证：待执行。
- 技术评审：待独立只读评审。
- 集成：pending。
- 人工功能验收：不适用；这是不改变产品交互/模型行为的内部诊断合同，按事件、隐私、兼容回归及独立审查验收，不声称用户已确认。
- 发布：稳定发布未授权。

## 功能验收包

- 入口：原子代理 spawn/workflow/interrupt；诊断由已有 observation port 接收。
- 预期：能区分容量拒绝、队列等待、取消收尾和宽限到期释放，且无任务内容/路径。
- 不通过表现：观察失败阻塞执行、终态事件冒充实际资源退出、重复通知、计数或身份失真。

## 交付记录

- 实际修改/运行/独立审查/工作树/剩余风险：待实施回填。
