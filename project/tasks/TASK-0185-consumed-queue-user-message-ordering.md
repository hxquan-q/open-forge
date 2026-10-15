---
id: TASK-0185
type: task
status: done
priority: P1
owner: apps/desktop
source: BUG-0068
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0068, BUG-0021]
execution: serial
branch:
worktree:
base_commit:
read_paths:
  - apps/desktop/src/renderer/domains/conversation/**
  - packages/runtime-core/src/kernel/**
write_paths:
  - apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window-controller.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts
  - apps/desktop/src/renderer/shared/store/message-queue-atoms.ts
  - apps/desktop/src/renderer/domains/conversation/services/conversation-projection.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window-controller.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.test.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.queue.test.ts
  - project/bugs/BUG-0068-queued-consumed-user-message-after-reply.md
  - .github/release-notes/v0.1.3.md
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0181]
integration_status: integrated
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 修复队列消费的用户消息被渲染到回复末尾

## 目标

被 kernel 队列消费的用户消息（含普通排队与「立即发送」）在流式期间、`agent_end` 历史重拉、窗口化提交与会话重开后，始终位于它触发的 Assistant 回复之前；未对账的乐观气泡按因果位置而非绝对尾部落位。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：TASK-0181 在独立 Worktree 改 Desktop 字体偏好（不同文件），无实际冲突，仅登记感知
- Branch：主树 `main`
- Worktree：不拆（单线串行小修）
- 集成负责人：当前 Agent
- 集成顺序：独立小修

### 做

- 修复 `ConversationProjection.flush()`：队列消费 `reset()` 后，若确定性 `assistant:{sessionId}:{turnId}` 已被列表占用，派生新目标消息 id 追加新行，不再原位替换。
- 修复 `insertUnresolvedOptimisticMessages`：未决乐观气泡按 `min(precedingUserCount, canonicalUserCount)` 的钳制序号插入，移除绝对尾部兜底。
- 修复 `reconcileWindowedProjection`：未消费 live-only 项按其 live 相邻 durable 锚点归位（最近已消费前驱之后 / 最近已消费后继之前），仅无锚点时追加尾部；补齐 canonical 落点索引供 span 重映射。
- 修复 `sendQueuedNow`：仅 kernel 返回 `started` 时保留派发序号作废；`missing` 等非派发结果撤回序号，避免本轮 `agent_end` 重拉被误判过期。
- 修复 `useSessionOpener` 未决乐观气泡合并与 `preserveMessagesAddedAfterSnapshot`：按 reconciled/live 锚点插入而非平铺尾部。
- 为每条路径补真实入口的失败复现回归用例。

### 不做

- 不改 kernel 队列/持久化语义；不把 internal/continuation 消息当用户消息投影。
- 不重构队列系统或 Runtime 事件合同；不动无关字体偏好等他人改动。

## Given / When / Then

- Given：进行中的回合消费了排队消息，规范历史尚未包含或刚包含其 canonical user 条目。
- When：流式继续、`agent_end` 重拉、窗口化 head 页延展、会话重开回填。
- Then：该用户消息始终位于其触发的回复之前；未决乐观气泡落在其发送时记录的因果位置，不追加到回复末尾。

## 必须保持

- 乐观气泡在规范历史到达前不丢失；确认后不重复、可编辑性回填。
- streaming 草稿、错误卡片、占位降级、分支/编辑与队列暂停语义不变。
- internal/continuation 输入不产生用户可见气泡。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run` 对 conversation-projection、optimistic-user-message-cache、transcript-window、transcript-window-controller、chat-message-snapshot、useSessionManager.queue 测试文件；新用例在旧实现下失败。
- 用户流程：排队消费 → 回复继续/结束 → 用户消息在回复前（事件级与组件级断言）。
- 质量检查：`bun run check:quick`，完成后 `bun run check`。

## 验收分层

- 工程验证：已通过——定向 96 例、conversation 域 956 例、test:impact 493 例、check:quick 与完整 `bun run check` 全绿（2026-10-03，主树）。
- 技术评审：自审——五处归位规则统一为「已消费后继锚定 → 下一个 canonical user 槽 → 尾部兜底」，仅对 kind=user 的 live-only/未决项生效；非 user 项与无锚点项维持原尾部语义，既有 96 例断言无弱化。
- 集成：与 frontmatter integration_status 一致；主树原子提交后验证。
- 人工功能验收：待验收；真实会话中排队消息消费的界面顺序待用户回归。
- 发布：未授权；发布说明已在 v0.1.3.md 修复节登记。

## 功能验收包

- 入口与前置条件：Desktop 会话，进行中回合存在 kernel 排队消息。
- 操作步骤或 AI 任务输入：回合中发送消息使其排队并被消费 / 点「立即发送」插队；等待回合结束并可重开会话。
- 预期行为与最终产物：用户消息在它触发的回复之前；历史重载与窗口化刷新不改变该顺序。
- 不通过表现与已知限制：消息出现在回复末尾即不通过。
- 验收反馈及回归案例：BUG-0068。

## 交付记录

- 实际修改：
  - `conversation-projection.ts`：`flush()` 在确定性 `assistant:{sessionId}:{turnId}` 已被占用时按 `…#N` 派生新 id，消费后回复不再原位替换、保住其前的镜像气泡。
  - `optimistic-user-message-cache.ts`：`insertUnresolvedOptimisticMessages` 仅当 `precedingUserCount > canonicalUserCount`（规范历史还没写到该序号）时尾部兜底；序号被更早落盘发送占用时按发送序号插入因果位。
  - `transcript-window.ts`：`reconcileWindowedProjection` 记录 live→items 落点 `landedIndex`，live-only user 项锚到最近已消费后继之前、否则锚到最近已消费前驱后的第一个 canonical user 槽之前，无锚点才尾部；新增 `canonicalItemIndexes` 供消费方定位。
  - `transcript-window-controller.ts`：span 重映射改经 `canonicalItemIndexes`。
  - `chat-message-snapshot.ts`：`preserveMessagesAddedAfterSnapshot` 同套锚定规则（持久化后继 → 持久化前驱后的首个 canonical user 槽 → 尾部）。
  - `useSessionOpener.ts`：会话打开回填时未决乐观气泡按 reconciled 中最近 canonical 前驱分桶插回，不再平铺尾部。
  - `useSessionMessageSender.ts` + `message-queue-atoms.ts`：新增 `unbumpQueuedDispatchSeq`；`sendQueuedNow` 仅在 kernel 返回 `started` 时保留派发序号，`missing`/IPC 失败撤回，避免本轮 `agent_end` 重拉被误判过期跳过。
  - 测试：六个测试文件新增 BUG-0068 回归用例，均在旧实现下先红。
  - `.github/release-notes/v0.1.3.md` 修复节登记本修复。
- 实际运行：
  - 定向：`run-vitest --run` 六文件 96 例通过；useSessionManager.queue 11 例通过；conversation 域全域 177 文件 956 例通过。
  - `bun run check:quick`：Biome/guards 全绿。
  - `bun run check`：lint / types(root,cli,desktop,docs,mobile) / guards / mobile-lint 全部 exit 0，ratchet new=0。
  - `bun run test:impact`：desktop direct 6 文件 96 例 + related 56 文件 397 例全绿。
- 未运行及原因：verify:ui 未获任务授权；打包验证不适用（纯渲染层逻辑）。
- Worktree：未拆出 worktree——单线串行小修，主树直接实施。
- 提交：`c9db5fa27`（主树 main，19 文件原子提交；pre-commit 门禁通过）。
- 剩余风险：
  - live-only 锚定启发式按「已消费邻居」定位；若 live 序列中邻居本身也是未决项（多层套叠未消费气泡），靠重拉后的下一轮对账收敛，有 `MAX_UNRESOLVED_RECONCILES` 上界兜底。
  - internal/continuation 输入不落盘为 canonical user 条目，其镜像若产生将按未决过期机制消亡；未观察到该形态。
  - 人工验收前保持 verifying。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

- 「重开会话」侧实测（真实 UI 隔离实例）：切出再切回后重建顺序为 `1000000` 用户 → `1000001` 助手 → … → `1000006` 用户「补充：完成后用一句话说明你刚才改了哪几项。」→ `1000007` 助手答复，排队用户原文保留在正确因果位；「继续流式」侧沿用会话 JSONL 因果序证据（排队用户原文 → 触发回复的工具流 → 追加消息 → 回复 → `turn.completed`）。
- 两侧子条件均已在真实 UI / 真实模型上直接观察，按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。
