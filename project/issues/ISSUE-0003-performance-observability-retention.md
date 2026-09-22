---
id: ISSUE-0003
type: issue
status: ready
priority: P1
owner: apps/desktop/runtime-core
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
source: .vetta app-monitor and desktop logs
created: 2026-09-22
updated: 2026-09-22
---

# 性能观测保存边界

## 问题

主日志记录了 Compaction，但 App Monitor 汇总显示为 0；同时需要记录进程、GPU、Heap、队列和操作耗时，又不能保存 Prompt、文件内容或凭据。

## 需要决策

- 采样频率和活跃/空闲策略；
- 本地长期保存与最近报告保存的边界；
- Session/Turn 关联字段；
- 聚合指标和原始事件的保留时间；
- 导出诊断包是否包含 GPU/Heap 明细。

## 推荐

监控走不可阻塞 side-channel，只保存聚合和诊断必要的元数据，业务路径失败不受影响。
