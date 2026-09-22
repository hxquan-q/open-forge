---
id: PLAN-0002
type: plan
status: in_progress
priority: P0
requirement: REQ-0002
owner: runtime-core/desktop/ai
source: exprot/session-memory.md and exprot/differential-testing-observability.md
created: 2026-09-22
updated: 2026-09-22
---

# 性能与可靠性基线

## 第一阶段

1. Provider 流协议 fixture。
2. Turn/Tool/Provider/MCP/Approval/Compaction/Team Member deadline。
3. bounded idle wait 与 recovery_required。
4. Compaction single-flight、滞回和冷却。
5. Main/Renderer/GPU/Heap/EventBuffer/Queue 快照。
6. 长会话与 Agent Team 内存上限。
7. WebGL、视频窗口和后台 Renderer 低功耗策略。

## 完成标准

- 失败、取消和超时都有明确终态。
- 同一 Session 不并发执行多个 Compaction。
- 性能快照可以定位主要瓶颈。
- 所有优化都通过可重复基线或 A/B 数据验证。
