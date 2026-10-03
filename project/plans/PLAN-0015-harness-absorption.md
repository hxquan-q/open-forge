---
id: PLAN-0015
type: plan
status: in_progress
priority: P1
requirement: REQ-0002
owner: coding-agent/runtime-core
source: user-request；RESEARCH-0021
created: 2026-10-03
updated: 2026-10-03
related_requirement: [REQ-0002]
related_tasks: [TASK-0197, TASK-0195, TASK-0198]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Harness 高价值机制的隔离、分阶段吸收

## 背景与目标

用户授权在独立 Git Worktree 实现 RESEARCH-0021 推荐内容；复用 REQ-0002，保留现有内核和 Runtime 分层。本计划只纳入前三项：缓存友好压缩、保守工具并发、慢消费者重同步。串行验证与原子提交，不派多 Agent。

## 当前事实

本地 main 基线 48b8e487fd47e4009da7edf0d09169426a873529；其他任务在途。摘要当前序列化原消息并替换 system prompt；生产工具批次串行；subscriber queue 为保真允许超限。研究结论不代替可失败基线。

## 候选方案与取舍

不嵌入 Pi/DSH 或复制另一 Session/Provider/Store。第一片沿现有摘要策略传递可选、Turn-local 的实际模型请求上下文，只在模型、前缀与预算兼容时保留前缀，否则走既有摘要路径。相比重新拼装 system/tools，实际请求来源避免冻结代际、工具别名与最终消息投影漂移。后两片在开工前独立确定最小公共合同及基线。

## 阶段

1. TASK-0197：创建一个批次工作树与交付闭环。
2. TASK-0195：缓存友好型摘要请求，保留取消、摘要质量、降级、prefire 和专用模型兼容。
3. 保守工具并发：前片验证并提交后建立串行子 Task，白名单/并发限额/屏障/顺序提交，覆盖 steering 和取消；不无条件打开全局并行。
4. 慢消费者重同步：先证明正常入口的压力与保真基线；若当前传输不具备安全替换快照合同，先形成窄接口迁移方案，不静默丢 delta。子 Task 开工前落盘。

## 不做什么

整体换核、codemode、自动副作用重放、独立 runtime 进程迁移、UI 重设计、真实模型付费评测、运行用户 Desktop、发布和稳定分支晋升。

## 验证与回滚

每片失败测试→实现→定向与正常入口流程测试→test:impact；公共跨包合同 test:changed；完整 bun run check。独立 commits 允许单片回退，旧会话无需迁移。代码只在 TASK-0197 工作树；main 脏时不集成、不推送。

## 升级信号

真实 Provider 成本/命中/质量需另授权；架构或行为歧义超出上述合同先报告。没有可验证收益不以“上游有”强推迁移。

## 需要的 ADR

第一片仅附加临时请求上下文与摘要选择策略，不改持久化或依赖方向；若后续重同步新增公共传输语义，先补对应 ADR。提案及边界由本计划记录。

## 调整（2026-10-03）

TASK-0195 的原消息前缀方案与现有摘要不可信 JSON/system 隔离冲突，暂缓，不为优化降低边界。先实施独立的 TASK-0198 有界工具并发；慢消费者方案仍需前置压力基线。
