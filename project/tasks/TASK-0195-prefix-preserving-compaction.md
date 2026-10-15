---
id: TASK-0195
type: task
status: blocked
priority: P1
owner: coding-agent/runtime-core
requirement: REQ-0002
plan: PLAN-0015
source: user-request；RESEARCH-0021 D1
related_requirement: [REQ-0002]
related_plan: [PLAN-0015]
related_tasks: [TASK-0197]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/coding-agent/src/compaction, packages/coding-agent/test, packages/runtime-core/src/kernel, packages/runtime-core/test/kernel, packages/ai/src/types.ts]
write_paths: [packages/coding-agent/src/compaction, packages/coding-agent/src/runtime-contracts/context-runtime.ts, packages/coding-agent/test, packages/runtime-core/src/kernel/contracts.ts, packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts, packages/runtime-core/src/kernel/turn-pipeline.ts, packages/runtime-core/test/kernel, project/tasks/TASK-0195-prefix-preserving-compaction.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 保留兼容模型请求前缀的摘要生成

## 目标与范围

在现有 Compaction 中增量支持 cache-friendly 摘要请求；保持专用摘要模型、首次无来源请求、变更后的历史/消息视图和降级路径兼容，不引入上游库。实际 Provider 缓存命中与成本不作未实测承诺。

## 并发评估

单 Agent 在 TASK-0197 工作树串行实施；空 branch/worktree 表示无第二工作树。与 TASK-0190 共享 turn-pipeline.ts，分支隔离、集成时人工按语义合并，不复制对方在途终态修改。

## 设计与直接修改/重构取舍

复用现有生成 recovery/quality，不另建压缩服务。Runtime 只传可选的、Turn-local 实际请求来源；产品层拥有模型/前缀/预算匹配和摘要指令。相比在产品层重建 system/tools，来源保留最终 frame 与消息投影。必要时提取纯请求构造函数，避免继续扩大 compaction.ts 的职责。公开合同仅新增可选内存字段，无持久化迁移。

## Given / When / Then

- Given 同模型最近实际请求与合法历史前缀；When 自动压缩/预压缩生成摘要；Then system、对应消息前缀、tools 与缓存提示保持，摘要要求仅追加在末尾，旧功能继续工作。
- Given 无请求来源、模型/provider/base URL 不一致、前缀不匹配、格式不支持或预算不足；When 摘要生成；Then 使用已有专用摘要 system + 序列化输入，不能带入无关或保留尾部消息。
- Given split turn、图片降级、低质量摘要、Provider 失败/取消；When 重试或回退；Then 保留已有上限/质量筛查/单航班/错误与取消语义，不执行摘要返回的工具调用。

## 必须保持

只读 request 来源不写入日志/持久化/观察事件，不存凭据；最多保留必要的一个请求视图且随 Turn 释放。不改变模型调用原消息/工具数组，不扩大权限，不修改 canonical conversation 或用户可见文案。无新 any、依赖或生成文件编辑。

## 测试与验证

先以 fake completion/stream 建失败请求断言，再实现；单元覆盖兼容选择、严格前缀、超预算、取消与摘要失败；Runtime 正常多工具→上下文压力→摘要→继续请求验证实际接线；回归 compaction、prefire、core adapter/checkpoint、专用模型。适用 test:impact/test:changed、完整 bun run check。不开真实 Provider/UI。

## 验收分层与功能验收包

工程/自审待执行，集成 pending，用户验收待；发布未执行。隔离 fake Provider 连续长任务的摘要请求保留可复用前缀，不兼容时仍完成原流程；正常任务不中断、不丢消息。真实缓存收益需要另授权评测，未实测前不能称性能提升。

## 交付记录

合同先落盘，随后在批次工作树实施；红绿命令、改动、提交与风险待填。

## 2026-10-03 反证与停止线

实跑请求前缀假设测试：1 failed，现有 system 为防注入摘要专用指令，历史经 JSON 包装；该失败揭示新假设与既有 summary-prompt-boundary 合同冲突，而非产品 Bug。撤回这条不安全的新测试要求（未改任何现存测试/断言/实现），将反证保留在此；未进行所谓 red→green。直接保留历史消息及原 system 会弱化已有明确边界，需重新设计或用户明确决策；默认继续安全路径。TASK-0198 可独立推进。
