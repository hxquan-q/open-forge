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
worktree: ../open-forge-wt/task-0397-agent-execution-hot-path
base_commit: 1584b54dfd6db56ee49d070d652b886705355e4d
read_paths: [packages/agent/, packages/ai/, packages/runtime-core/, packages/runtime-subagents/, packages/coding-agent/]
write_paths: [packages/agent/src/engine/, packages/agent/test/, packages/runtime-core/src/kernel/, packages/runtime-core/test/kernel/]
exclusive_paths: []
depends_on: [TASK-0394]
conflicts_with: []
integration_status: pending
created: 2026-10-23
updated: 2026-10-24
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

## 只读调查结果（2026-10-24）

原生 actor `f4532216-fafe-4c9` 已回收，未写代码/运行测试：生产 `StatelessAgentCoreTurnEngine.createRequest` 的 frames Map 每次 set、resolveModelCall get 后不删除，持有历史 frame（含递归复制的 schema/工具包装闭包）直至 Turn 结束；没有发现历史 frame 再消费路径。首选候选是读到 frame 后移除已消费 Map 项，保留局部 frame/currentFrame 和工具闭包，不能把历史保留误称为跨 Turn 永久泄漏。

验证应在活跃 Turn 的末次模型 gate 内观测 retained heap/引用路径，不能只在 Turn 完成释放后测；覆盖 initialFrame、动态工具、失败恢复、取消、composition、tracing，以及短调用无收益对照。实际内存收益未知，尚未实现。

RESEARCH-0043 另发现 Pi 的双栈 FIFO 可供 EventStream 对照，但本仓 fail/end/multiple-waiter 合同更强；该候选触及 ai 包，须另开/收紧 Task 并测实际积压，不与 frame 引用释放一起试。

## 验收分层与交付记录

工程/技术审查尚未执行；集成 pending；内部行为保持型优化人工验收不适用，模型质量未知；发布未授权。已取得明确热点候选但缺实测，原会话共享 Autoresearch 配置由 TASK-0392 占用，需从隔离目录启动实验后才能建立新指标与 baseline，不把 draft 当编码许可。
