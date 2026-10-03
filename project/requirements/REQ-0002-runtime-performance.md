---
id: REQ-0002
type: requirement
status: ready
priority: P0
owner: runtime-core/desktop
source: .vetta logs and exprot/session-memory.md
related_plan: [PLAN-0002, PLAN-0015]
created: 2026-09-22
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Runtime 性能与可靠性基线

## 用户结果

用户取消 Agent、切换 Session、新建 Session 或恢复长会话时，系统必须在可解释的有限时间内给出终态，不得永久停留在运行中。

## 必须保持

- 旧 Turn 未安全结束前不得静默启动新 Turn。
- Provider、Tool、MCP、Approval、Compaction 和 Team Member 的取消与失败必须可观察。
- 失败不能只通过 Renderer loading 状态掩盖。
- 性能观测不能记录 Prompt、凭据、文件内容或可重建的私有数据。

## 验收方向

- Provider/Tool 不响应 AbortSignal 时仍有 deadline 和 recovery_required 路径。
- Compaction 不重复并发，失败后有明确终态。
- Main、Renderer、GPU、Heap、EventBuffer、Queue 和关键操作耗时可采样。
- 高负载视觉装饰可暂停、降级或关闭。

详细证据和验证矩阵见 [`exprot/session-memory.md`](../../exprot/session-memory.md) 与 [`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md)。
