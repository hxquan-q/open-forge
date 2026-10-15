---
id: TASK-0194
type: task
status: done
priority: P1
owner: apps/desktop
source: BUG-0073
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0073, BUG-0068]
execution: parallel
branch: task/TASK-0194-queue-anchor-review-fixes
worktree: unassigned（已集成并推送 origin/dev，worktree 与分支已清理）
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths:
  - apps/desktop/src/renderer/domains/conversation/**
  - apps/desktop/src/renderer/shared/store/message-queue-atoms.ts
  - project/bugs/BUG-0073-queue-fix-anchor-regressions.md
write_paths:
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.ts
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/transcript-window-controller.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.ts
  - apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.test.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionMessageSender.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.queue.test.ts
  - apps/desktop/src/renderer/shared/store/message-queue-atoms.ts
  - apps/desktop/src/renderer/domains/conversation/services/optimistic-user-message-cache.test.ts
  - project/bugs/BUG-0073-queue-fix-anchor-regressions.md
  - project/tasks/TASK-0194-queue-anchor-review-fixes.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.ts
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0181, TASK-0154]
integration_status: integrated
created: 2026-10-03
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 修复 BUG-0068 修复提交复审发现的锚定/派发序号回归

## 目标

BUG-0073 四项缺陷修复后：失败队列派发不再误杀最新轮 `agent_end` 重拉；未消费排队气泡不再被锚进历史中段；`prependedCount` 语义还原为「新前插 projected 条数」；窗口化/快照/opener 三层对未决气泡共用同一锚定与回退规则。

## 范围

### 并发评估

- 结论：条件支持并行——conversation 域文件独占（`exclusive_paths` 锚定新模块），与其他在途 Task（TASK-0186/0187 批次，均为 plugins/packages 域）无路径交集。
- 执行方式：独立 Worktree `task/TASK-0194-queue-anchor-review-fixes`，单 Worker 串行实现。
- 前置依赖：无（基于 main HEAD 48b8e487f，含 c9db5fa27）。
- 冲突文件：共享 Project 索引（tasks/bugs README）由协调阶段在主树更新，不进本 Task write_paths（TASK-0186 惯例）。Release Notes 随修复提交走推 dev → 合 main 全程，与已入库 Task 的目录级/同名声明撞碰登记 `conflicts_with`（TASK-0122/0123/0181）。TASK-0187/0196/0197 的记录在并行会话尚未入库，worktree 视图解析不了引用、不登记；它们的目录级声明（project/tasks、apps/desktop 伞）与本 Task 实际文件无交集，集成阶段在主树按实际文件集核对、后到者重排。
- 集成负责人：当前 Agent（用户已授权：验证通过后推 `origin/dev`，再合回本地 main）。
- 集成顺序：与其他并行 Task 无依赖，验证通过即可推送/集成。

### 做

- 抽取共享锚定助手 `services/pending-user-anchor.ts`（行为保持重构，先行为保提交）：后继锚定 (a)、孪生槽锚定 (b)、尾部兜底 (c) 一份实现；`transcript-window.ts`、`chat-message-snapshot.ts`、`useSessionOpener.ts` 三处收编；顺带删除退化的 `canonicalCount` 字段（单一事实源 `canonicalItemIndexes`）。
- 缺陷 1：`agent_end` 判活由 `current !== snapshot` 收紧为 `current > snapshot`（`useSessionEventController.ts` 两处），失败派发的 unbump 落在快照之后不再误判「跨轮」；`message-queue-atoms.ts` 注释同步。
- 缺陷 2：共享助手 (b) 分支加孪生校验——锚定槽 user 文本须与气泡一致（复用 `optimistic-user-message-cache` 的 `sameText` 语义并导出），不匹配维持尾部。
- 缺陷 3：`prependedCount` 只统计头部连续「非 live 复用」的 projected 条目，删除首部 live-only 项 `+=`。
- 缺陷 4：opener 的 missing 气泡合并改走共享助手（以 reconciled 为序、merged 为基），回退方向与 snapshot 层一致。
- 回归用例：BUG-0073 所列 4 组，旧实现先红。

### 不做

- 不改 kernel 队列/持久化/事件合同；不做 turn 身份判活的深层重构（评审发现 5/6，登记后续）；不做锚点扫描 O(k·(L+N)) 预计算优化（发现 8）；不动他人未提交改动与共享 README 索引（协调阶段处理）。

## Given / When / Then

1. **失败派发不误杀重拉**：Given turn-A 流式中两次「立即发送」点击（q-1 开 turn-B；q-2 或返回 `missing`、或按实测**各自另起一轮**），turn-B 的 `agent_start` 快照落在膨胀窗口内；When q-2 的 unbump 使序号回落、turn-B `agent_end` 到达；Then 重拉照常落地（entryId/时长/镜像吸收完成）。**用户裁定（2026-10-08）**：「两次派发」为可接受行为，不要求构造 `missing` 时序；`missing` 分支维持单测覆盖。
2. **幽灵气泡保持尾部**：Given live=[已持久化 u-1, pending 镜像 X, pending 幽灵 Y]，canonical=[u-1, user X, assistant]；When 窗口化/快照对账；Then Y 追加尾部，X 仍锚在孪生槽之前。
3. **prependedCount 语义**：Given live=[pending, 已消费 u, 已消费 a]，canonical=[u, a]；When (a) 锚定到 0；Then `prependedCount === 0`。
4. **两层回退一致**：Given missing 气泡在 reconciled 中先于首个 canonical 项、merged 头部有 preserve 保留行；When opener 对账合并；Then 气泡落 canonical 首项之前、保留行之后，与 snapshot 层同形输入一致。

## 验证

```bash
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/pending-user-anchor.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.test.ts
bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.queue.test.ts
bun run test:impact -- <改动文件...>
bun run check:quick -- <改动文件...>
bun run test:changed --base origin/dev
bun run check
```

## 交付记录

### 实际修改（重构 120b6af80 + 修复 24579b588）

- 重构（行为保持）：新增 `services/pending-user-anchor.ts` 共享锚定助手；`transcript-window.ts` / `chat-message-snapshot.ts` 改走共享管线；删除退化字段 `canonicalCount`（`transcript-window-controller.ts` 改用 `canonicalItemIndexes.length`）。
- 修复：`agent_end` 判活「不等」→「净增长」（`useSessionEventController.ts` 两处，`message-queue-atoms.ts` 注释同步）；助手 (b) 分支加孪生槽校验（导出 `sameUserText` 复用同一判等）；`prependedCount` 只计头部连续「非 live 复用」projected 条目；opener 的 missing 气泡合并改走共享助手、回退方向与快照层一致。

### 测试（TDD，先红后绿）

- 新增 5 组回归（旧实现确认红）：`transcript-window.test.ts`（幽灵尾部、prependedCount）、`chat-message-snapshot.test.ts`（幽灵尾部）、`pending-user-anchor.test.ts`（(b) 孪生校验 + 两层一致性等 5 例合同）、`useSessionManager.queue.test.ts`（事件级 unbump 竞态）。
- 定向 4 文件 64/64 绿；conversation 域 177 文件 965/965 绿；`test:impact`（11 改动文件）52 文件 282/282 绿。

### 检查

- `check:lint`、`check:types`（root tsgo + desktop/cli/docs）、`bun run --cwd apps/mobile lint`：绿。
- `check:quick`/`check:guards` 按 HEAD 归因出两处非本 Task 的存量红：①修改声明头 ratchet「基线中已修复 8 条」（基线 a4c7374d3 起、主树同红）——按门禁指定动作 `--write-baseline` 收缩已修复条目，独立 chore 提交，收缩后 ratchet 绿；②`project/tasks/README.md:18 unknown TASK-0186`（并行会话已提交索引行但其记录文件未入库；主树视图不红）——保持原样，待其批次入库自愈。

### 未运行与剩余风险

- 完整 `bun run check` 在 worktree 视图因②外部存量红不终绿；集成阶段在主树复跑完整 check 作终验。
- `test:changed --base origin/dev` 在 worktree 运行 30 分钟无输出，手动终止（已核对 run-vitest/test-changed 脚本无 git 写操作）；其相对既有证据的增量覆盖（origin/dev..HEAD 代码改动全部落在 conversation 域 + docs）已由 conversation 域 965 例与 `test:impact` 282 例覆盖，集成阶段重跑补证。`verify:ui:*` 未获任务授权未运行，真实会话人工回归待用户。
- 根因深度维持现状：镜像气泡消费点尾追 + 全局序号计数器（评审发现 5/6 的 turn 身份判活重构）登记为后续；(b) 孪生校验按文本判等，displayText 漂移的镜像会退到尾部、经既有对账上限后清理，行为等级与修复前持平。
- 集成顺序：验证通过后 `git push origin task/TASK-0194-queue-anchor-review-fixes:dev`（用户本轮明确授权），再于主树合入本地 main；合入后同步共享索引（bugs/tasks README）。

### 人工验收实测（2026-10-07，VERIFY-0017 组一，保持 verifying）

在隔离实例的真实会话（真实模型 DeepSeek V4.1 Flash）里重跑一遍用户可见面：发一条长输出请求（回合 A）后，在 A 仍在途时再发一条 `QUEUE-PROBE-B`，随后按 `[data-index]` 逐秒采样消息条目顺序。

- 排队气泡落在**尾部**而非历史中段：B 发出后条目序列为 `…27:A 的提问 → 28:回合 A（等待→处理）→ 29:QUEUE-PROBE-B`，B 始终紧跟在正在输出的回合 A 之后，未出现被锚进 A 之前或历史中段的情况。
- 消费后按序派发、无残留重影：A 结束后终态为 `30:回合 A（02:21:02）→ 31:QUEUE-PROBE-B → 32:回合 B（02:21:07）`，B 被原位消费并作为独立回合派发，没有重复气泡、没有幽灵条目留在尾部之后。
- 未闭合原因：本项 4 条 GWT 中，①失败派发竞态要求同一时刻两次「立即发送」且 q-2 返回 `missing`、②幽灵气泡要求 live 同时含 pending 镜像与幽灵态，这两个前置状态无法从 UI 稳定构造（需要注入内核事件/时钟）；③`prependedCount` 与 ④两层回退一致性属内部不变量，只有单测可观测（交付记录 4 文件 64/64 已覆盖）。因此本条仅补上「排队气泡尾部锚定 + 按序消费」这一用户可见面的实测，仍按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 保持 `verifying` 交用户裁定。

### 竞态与幽灵气泡实测（2026-10-08，VERIFY-0017 组一续测十四，保持 verifying）

上一轮把 GWT ① 与 ② 记为「UI 无法构造」。本轮先给可控故障夹具加长流控制面（`<debug vettaHome>\fixtures\fault-mock` 新增 `GET /control/slow?n=&ms=`，单回合稳定流式 14 秒以上），再复现两条路径。

- **① 两次「立即发送」的可达路径**：队列抽屉入口是文本「队列 N 条待发」的按钮，展开后每条排队消息一个 `button[title="立即发送"]`。同一 tick 内点两条（相隔 1.7 ms）→ 流式中的回合被 `turn.cancelled(reason="send queued message now")` 打断，**被打断回合的部分回复保留**（会话记录 `步 1 步 2 步 3` 与 UI 的「·4秒」行同时在），无错误气泡、无 `sendQueuedNow failed` 日志。
- **① 的 GWT 前提未复现**：同一次会话记录显示 q-1、q-2 **各自成为新回合**（`turn-1f4dc64b` / `turn-eecb181d`），没有出现 q-2 返回 `missing` 的时序——即「两次派发」而非「一次派发 + 一次 missing」。该次观测在回合跑完前被我方夹具崩溃打断（slow 流在客户端断开后仍 `enqueue`，未捕获异常打死夹具进程；已修），故「对账后位置」这一次观测仍缺。
- **② 幽灵气泡可稳定构造且复现出缺陷**（无需注入内核事件，正常操作即可）：回合流式中连发两条消息排队，等回合结束、队列抽屉不再显示「N 条待发」后，实时视图仍比落盘多出**两个重复用户气泡**并追加尾部——DOM 8 行 `GHOST-1 / 回复 / GHOST-A / 回复 / GHOST-B / GHOST-A / 回复 / GHOST-B`，会话记录只有 6 条（seq2–7）。重复行 `data-entry-id` 是**乐观 id**（`user-16-1791391810833`、`user-17-1791391811301`），正牌行是**规范 id**（`event-4`/`event-6`）⇒ 未决乐观气泡未被规范历史吸收；刷新重开同一会话恢复 6 行 ⇒ 幽灵只在渲染端 live 层。两个会话复现 **2/2**。
- **结论**：与上一轮「无尾部幽灵残留」相反，本条 ② 的用户可见面存在缺陷，与 BUG-0068（同族，`verifying`）症状一致。本 Task 保持 `verifying`；幽灵归 BUG-0068 残余变体还是新缺陷、以及 ① 是否按「两轮派发也可接受」改写 GWT，交用户裁定。证据：`0194-ghost-duplicate-tail.png`、`0194-ghost-session-conversation.jsonl`。

### 用户裁定（2026-10-08）：幽灵并入 BUG-0068，本项闭合为 `done`

用户在 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 组一收口轮裁定两条：

1. **重复气泡归属**：归入 [BUG-0068](../bugs/BUG-0068-queued-consumed-user-message-after-reply.md) 作**残余变体**跟踪（已在该 Bug 记录追加裁定段并登记 `related_tasks: TASK-0194`），不另立新缺陷。理由：症状同族（未决乐观气泡未被规范历史吸收、只在渲染端 live 层、刷新即恢复），本 Task 的修复范围（四处锚定/派发序号回归）视为有效；该残余变体不属于本 Task 的 GWT ①②③④ 任一子句的失败，故不阻塞本项验收。
2. **GWT ① 口径改写**：接受「两轮派发亦可接受」（同上方 Given/When/Then 内联裁定），不再要求构造 q-2 返回 `missing` 的时序；`missing` 分支维持单测覆盖（`useSessionManager.queue.test.ts` 事件级 unbump 竞态例）。

- 验收依据：① 用户可见面实测——排队气泡尾部锚定（`…29:QUEUE-PROBE-B` 紧跟在途回合）、按序消费无残留重影（`30→31→32`）；② 竞态与取消实测——两次「立即发送」各自成回合、被打断回合的部分回复保留、无错误气泡；③ 内部不变量（`prependedCount`、两层回退一致性）由 4 文件 64/64 单测覆盖；④ conversation 域 965 例、`test:impact` 282 例绿。
- 状态：`verifying` → `done`。残余变体的修复与验收归 BUG-0068；本 Task 的 `integration_status`（已集成并推送 origin/dev、worktree 与分支已清理）不变。
