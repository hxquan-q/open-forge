---
id: TASK-0051
type: task
status: draft
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0034 / RESEARCH-0004 P1-1 第 3 步
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/main/ipc/session.ts, packages/runtime-core/src/conversation]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0035, TASK-0050]
conflicts_with: [TASK-0038]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# transcript 窗口化第 3 步：compaction 边界重放

## 目标

在有界占位与游标分页之上落实 compaction 边界的 Renderer replay：压缩可释放非窗口内完整 blocks，但不删除、覆盖或隐藏 JSONL transcript 中 compaction 之前的用户可见消息。

## 范围

### 并发评估

- 结论：不支持并发；依赖 TASK-0050 的 cursor/page 稳定语义，并与 TASK-0038 的 compaction event/controller 共写渲染边界。
- 执行方式：共享 `forge/dev` 工作区串行。
- 可并行 Task：无（transcript 链内）。
- 前置依赖：TASK-0034 合同、TASK-0035 占位实现、TASK-0050 游标分页。
- 冲突文件/独占路径：conversation projection、`useSessionEventController` compaction handling、history page reconciliation。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不建独立 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0035 → TASK-0050 → TASK-0051 → TASK-0038。

### 做

- 成功 compaction 后从持久化 history/page 投影重建当前有界窗口，保留原消息顺序、compaction entry 的原位置与 stable id。
- compaction entry 展示其 summary/boundary 作为独立轻量时间线条目；压缩前已显示的完整消息降为可还原占位，不以 summary 替代或删除。
- 保留当前 viewport anchor；若当前可视内容位于非窗口范围，必要时先恢复其对应页，再应用压缩后的窗口释放策略。
- 压缩前任意占位可通过 TASK-0050 cursor page 重新读取并恢复；branch change、append 和过期游标遵循 TASK-0050 的 stale/reload 规则。
- 失败或取消 compaction 不重建、不丢弃已驻留内容；完成后仍可继续发消息、向上翻页和回看边界前记录。

### 不做

- 不负责触发 compaction、thrash 检测、失败熔断或溢出尺寸种子（TASK-0038）。
- 不改变 `ContextCompactionRecord`、JSONL schema、持久化 history、模型上下文选择或页游标协议。
- 不以删除边界前旧记录换取内存下降；不做完整 Renderer 管线重写。

## Given / When / Then

- Given：用户正浏览一条长会话的历史区域，目标记录可能在当前尾页之外。
- When：手动或自动 compaction 成功完成，随后继续向上/向下浏览、打开旧记录或继续对话。
- Then：当前阅读锚点稳定，compaction summary/boundary 可辨认；边界前消息仍在原序列中以占位形式定位，并能经 cursor 恢复完整内容；活动窗口之外的 blocks 得以释放，JSONL 与完整导出保持不变。

## 必须保持

- JSONL 是唯一事实源；Compaction summary 不替代任何 user/assistant/tool transcript 内容。
- 所有已发消息始终可见、可定位、可展开；工具、媒体、错误、usage、timing 与分支语义不丢失。
- compaction 失败/取消及边界重建期间不清空会话、不丢滚动锚点、不覆盖 streaming/live/optimistic 消息。
- 执行后 Renderer 重型对象数由当前窗口与明确 pin 集合决定，不随全历史 blocks 数增长；Metadata 可保持全历史 O(n)，此 Task 不承诺 O(window) 总条数。

## 测试与验证

- 定向集成：至少两次 compaction 的边界顺序、摘要独立可见、旧消息可重新分页恢复；失败/取消保持投影；重建期间 live append/optimistic 消息不丢。
- 代表流程：打开长会话 → 加载并浏览旧页 → 触发 compaction → 继续发送 → 再定位/展开 compaction 前一条工具或媒体消息 → 导出完整历史核对边界前后均存在。
- 用显式同步点控制 compaction event 与 page response 顺序，不用任意 sleep；组件/Hook 测试断言滚动锚点与用户可见消息，合同测试断言 JSONL 事实未变。
- 性能：相同合成长会话对比 compaction 前后 Renderer privateBytes 与驻留完整 blocks 数；切换会话后旧窗口释放。
- 质量：`bun run test:impact -- <改动文件...>`、`bun run check:quick -- <改动文件...>`；完整实现轮结束后 `bun run check`，补当前版本 Release Notes。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
