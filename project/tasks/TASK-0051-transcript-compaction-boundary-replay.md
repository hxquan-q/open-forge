---
id: TASK-0051
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0034 / RESEARCH-0004 P1-1 第 3 步
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/main/ipc/session.ts, packages/runtime-core/src/conversation]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0035, TASK-0050]
conflicts_with: [TASK-0038, TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-09-23
updated: 2026-10-09
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

## 交付记录（2026-10-03，TASK-0196 批次）

### 范围裁决（对照合同与现行实现）

- **已存在能力（retain）**：compaction 条目按轻量 event 条目投影（`fullHistoryToChatWithSpans`）；TASK-0035 占位降级与 TASK-0050 游标分页/占位恢复链完整；失败/取消不重建；JSONL 唯一事实源未触碰。
- **缺口一（已修）**：控制器只对 `reason === "manual"` 重建，自动压缩成功后界面完全无感知（边界条目不出现）。
- **缺口二（已修）**：手动路径用 `resetTranscriptWindowToTail` 整窗重置，向上翻页已加载的旧页与阅读锚点被丢弃；runtime 事实是压缩为**追加式**（document.ts：entries 追加 compaction 条目 + firstKeptEntryId，entry id 不变），head 合并刷新天然安全，且 `mergeTranscriptHeadPage` 签名不匹配时自行降级为整窗替换（等价旧行为）。

### 实际修改

- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts`：compaction.end 成功（任意 reason，队列空守卫保留）→ 重建链改为 `refreshTranscriptTail`（head 合并，保留旧页与窗口态）→ 失败/非窗口化再 `resetTranscriptWindowToTail` → 最后全量回载（原路径）。
- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.compaction.test.tsx`：新增两例——自动压缩成功后边界条目可见；手动压缩重建保留已加载旧页（backlog 含压缩前用户消息）。

### 实际运行

- 红测先行：自动压缩用例失败于「compaction 条目不出现」（无重建路径）；手动用例失败于 backlog 被重置为 head 页。
- 定向 5/5；`test:impact` 5+90 例通过；`check:quick`、完整 `check` 通过。

### 未运行及原因

- 真实 Desktop 长会话滚动锚点实测与 privateBytes 对比：本批不做实机/视觉验证；窗口态保留由 `transcriptWindowStateAtom` 不被重置与 backlog 合同测试佐证。
- 两次连续 compaction 的定向集成：追加式合并链对连续压缩自然成立（同一条目流），以单次压缩 + 既有分页族测试覆盖。

### 剩余风险

- 压缩与向上翻页在途并发时，合并按内容签名对齐，不匹配即整窗替换——正确性优先，锚点可能在该罕见交错下回到尾部（与旧行为一致，不劣化）。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：本任务与 TASK-0038 共用渲染端联动用例，本轮复跑同一条；压缩参数面读 coding-agent 压缩族。真实 UI 未驱动。

| 合同条款 | 本次读数 |
|---|---|
| 压缩成功后边界条目可辨认、阅读锚点稳定 | `useSessionEventController.compaction.test.tsx` **1 文件 / 5 例通过**（其中两例即本任务交付记录新增：自动压缩成功后边界条目可见、手动压缩重建保留已加载旧页 backlog） |
| 边界前消息仍在原序列以占位定位、可经 cursor 恢复完整内容 | 占位与 cursor 机制归 TASK-0035/0050，本轮按 TASK-0050 的 7 文件 / 93 例读数一并成立 |
| 活动窗口外 blocks 释放、JSONL 与完整导出不变 | coding-agent 压缩族 **8 文件 / 56 通过 \| 2 跳过**（`compaction`、`compaction-configuration`、`compaction-prefire` 等） |

- **未覆盖**：真实「浏览长会话历史区域 → 触发压缩 → 继续上/下浏览」的用户面往返；需要真实长会话，本轮未驱动。
- **关闭建议**：合同三条在测试级成立，倾向 `done`；真实用户面往返是否要求补测，请用户裁定。

### 用户裁定闭合（2026-10-09，VERIFY-0017 分档口径）

按用户「**按未覆盖成因分档**」口径裁定：本 Task 的未覆盖项属**合同边界外**，不构成缺口，据闭合。

- 真实「浏览长会话历史 → 触发压缩 → 继续上/下浏览」用户面往返：交付记录明记「真实 Desktop 长会话滚动锚点实测与 privateBytes 对比：**本批不做实机/视觉验证**」；窗口态保留由 `transcriptWindowStateAtom` 不被重置与 backlog 合同测试佐证。真实长会话不是本任务的验收对象。
- 可及范围内证据：`useSessionEventController.compaction.test.tsx` 5 例（含本任务新增两例：自动压缩后边界条目可见、手动压缩重建保留已加载旧页）+ 压缩族 8 文件 56 通过 | 2 跳过。
- 用户如不认可以此口径闭合，按原状态回退 `verifying` 即可。
