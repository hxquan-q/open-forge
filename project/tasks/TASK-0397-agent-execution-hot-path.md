---
id: TASK-0397
type: task
status: draft
priority: P1
owner: packages/agent/runtime-core
requirement: REQ-0002
plan: PLAN-0024
source: user-request / execution profiling
related_requirement: [REQ-0002]
related_plan: [PLAN-0024]
related_tasks: [TASK-0394, TASK-0395, TASK-0396]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0397-agent-execution-hot-path
worktree: unassigned（热点证据与窄合同确定后创建）
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [packages/agent/, packages/ai/, packages/runtime-core/, packages/runtime-subagents/, packages/coding-agent/]
write_paths: [packages/agent/src/engine/, packages/agent/test/, packages/runtime-core/src/kernel/, packages/runtime-core/test/kernel/]
exclusive_paths: []
depends_on: [TASK-0394]
conflicts_with: []
integration_status: pending
created: 2026-10-23
updated: 2026-10-23
---
<!-- Copyright The Open Forge contributors. -->

# Agent 执行热路径的测量与窄优化

## 目标与范围

参考 TASK-0394 并沿生产路径找出一个可量化的执行开销热点，优先重复物化/查找/事件处理，不预先指定优化结果。分类 Upstreamable。当前仅允许只读调查；选定热点后收紧 write_paths、Given/When/Then 与指标并转 ready/in_progress，再开独立 Worktree。

条件支持只读并行；生产代码本批串行，禁止和 Team 工作共享目录写入。不重写内核、不新增依赖、不修改公开调度/steering、权限、Provider 或持久格式。真实 Provider 不运行。

## Given / When / Then

- Given 固定模型事件/工具输入，When 通过实际 runAgentTurn/TurnEngine 运行不同工具数、历史长度与 chunk 形态，Then 外部结果、工具顺序、失败/取消、usage/stop 与终止次数一致，框架开销有可复现改善。
- Given 短任务、长历史与未用于调优的输入形态，When 复测，Then 无高尾延迟/内存灾难性退化。

## 必须保持

Turn generation 固定、工具授权顺序、parallel-safe/exclusive 屏障、steering 窗口边界、错误/取消传播、终态唯一、AI Core 依赖边界。

## 测试与验证

至少纯文本、工具循环/多个工具、Provider/Tool 错误、取消、usage/stop 和恢复；正常连续用户流程需消费侧合同覆盖。使用 Node runner、impact/changed 与完整 check。固定负载、留出集、交错 A/B；无显著收益不保留，不为跑分放宽校验。

## 验收分层与交付记录

工程/技术审查尚未执行；集成 pending；内部行为保持型优化人工验收不适用，模型质量未知；发布未授权。热点、基准及最终路径待研究后补齐，不把 draft 当编码许可。
