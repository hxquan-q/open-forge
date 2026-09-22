---
id: BUG-0003
type: bug
status: confirmed
priority: P1
owner: apps/desktop/app-monitor
requirement: REQ-0002
plan: PLAN-0002
source: C:\Users\xquan\.vetta\app-monitor\summary.json and desktop logs
created: 2026-09-22
updated: 2026-09-22
---

# App Monitor 漏记 Compaction

## 实际行为

主日志存在多次 Context Compaction 和一次失败，但 App Monitor 汇总中的 compaction started/succeeded/failed 都为 0。

## 期望行为

主流程事件与聚合统计应可解释地一致；如果采集不覆盖 Team/某 Runtime 路径，应明确标记覆盖边界。

## 回归测试

使用 fake Runtime event stream 写入 start/success/failure，验证 App Monitor 聚合、重启恢复和诊断导出的一致性；不把用户内容写入指标。
