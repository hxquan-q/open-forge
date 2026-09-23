---
id: ISSUE-0003
type: issue
status: done
priority: P1
owner: apps/desktop/runtime-core
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
source: .vetta app-monitor and desktop logs
created: 2026-09-22
updated: 2026-09-22
---
<!-- Copyright The Open Forge contributors. -->

# 性能观测保存边界

## 决策（已全部冻结，与 TASK-0004 实现一致）

| 决策项 | 结论 |
|---|---|
| 采样频率与活跃/空闲策略 | 活跃 2s、空闲 30s 自适应采样（已实现，`perf-snapshot.ts`） |
| 本地长期保存边界 | **原始事件不落盘**；只保留聚合快照——内存 ring buffer（180 个 Turn 级样本 + 64 个全局样本），重启即清 |
| Session/Turn 关联字段 | 只保留 `sessionId`/`turnId`/计数/时长等数字与 id，**不落 Prompt、文件内容、凭据**（已落实为类型级约束） |
| 聚合与原始事件保留时间 | 原始事件仅在内存投递后即丢弃，无 TTL 概念；聚合快照随 ring buffer 生命周期 |
| 诊断包是否含 GPU/Heap 明细 | **只含数字聚合**（`perf-snapshot.json`），不含进程名/路径明细；Prompt/内容/凭据绝不进入诊断包 |

## 依据

监控走不可阻塞 side-channel，业务路径失败不受影响——TASK-0004 的快照通道已按此实现并验证；
「原始事件不落盘」直接把数据暴露面压到最小，且当前没有需要事后回溯原始事件的场景。若未来出现该需求，
以新 Issue 提出并单独设计留存窗口。

## 关联

TASK-0004（快照采集）已交付实现；本 issue 是留存策略的决策记录。App Monitor 汇总为 0 的缺陷由 BUG-0003 修复。
