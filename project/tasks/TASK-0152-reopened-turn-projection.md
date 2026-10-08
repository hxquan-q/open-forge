---
id: TASK-0152
type: task
status: done
priority: P1
owner: desktop conversation
source: user-request; upstream 04ac47b67, 89f270e56, 2d744ff4a
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts, apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts, apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.reopen-turn.test.tsx, apps/desktop/src/shared/conversation]
write_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts, apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts, apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.reopen-turn.test.tsx, apps/desktop/src/shared/conversation, project/tasks/TASK-0152-reopened-turn-projection.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts]
depends_on: [TASK-0148]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 恢复运行中会话的回复段身份

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：04ac47b67, 89f270e56, 2d744ff4a。

基于恢复消息接续现有 turn segment；保留本仓窗口化历史、TranscriptItemSpan、缓冲上限与事件去重。排队立即发送/消息身份修复只在能分别复现时适配。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

切出再切回同一运行回合不分裂、工具/用户消息段保持、窗口化历史、迟到事件、立即发送。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0148。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次）

### 范围裁决（对照上游三补丁与本仓现状）

- **04ac47b67（重开续流不分裂）＝本任务核心，已适配**：上游用 adoptTurn 接回分段；本仓身份域不同（历史 assistant 以 entryId 为 id、live 投影以 tail 流式草稿为目标），缺陷成因是「canonical 历史含运行回合部分内容 + live 草稿（draft id）在回填合并时被双重保留」。落地为本仓等价语义：折叠合并 + 目标迁移。
- **89f270e56（立即发送两条回复同时处理中）与 2d744ff4a（prompt 转发丢 messageId）＝本仓已有等价能力，retain**：用户消息身份与落位由 pending-user-anchor 因果锚定解决（BUG-0068 修复 c9db5fa27、BUG-0073 合并锚定已随 dev 落地并有测试）；本仓 runtime-host 无逐字段重建 prompt 的对应路径。未移植，证据为 `pending-user-anchor.test.ts` 与两次 Bug 修复记录。
- 上游新 feed/attach 大迁移（RESEARCH-0022 §4）按其「被否决的直接同步方案」边界不做整体替换；本任务只吸收身份连续语义，窗口化、TranscriptItemSpan、4096 事件缓冲、乐观消息因果顺序全部保留。

### 实际修改

- `apps/desktop/src/renderer/domains/conversation/services/chat-message-snapshot.ts`：新增 `reconcileRunningTurnDraft(canonical, current)`——canonical 尾 agent + current 尾流式草稿 + 两边最后 user 一致时，草稿内容折入 canonical 的 id/entryId 并给出 retarget；否则原样返回交由 preserve 步。
- `apps/desktop/src/renderer/domains/conversation/services/conversation-projection.ts`：`retargetMessageId(from, to)` 迁移流式目标。
- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts`：控制器返回 `retargetProjectionMessage`。
- `apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts`：历史回填提交时先折叠再 preserve，折叠发生即迁移投影目标，后续增量继续落在同一条消息。

### 实际运行

- 红测先行：`reconcileRunningTurnDraft`/`retargetMessageId` 缺失时 6 例红。
- 单测 15/15（chat-message-snapshot 13 + conversation-projection 2）。
- `bun run test:impact -- <四文件>`：245 例通过。
- `bun run check:quick`、完整 `bun run check`：通过。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

- 在真实 UI 隔离实例里发起 todo 工具链回合，运行中切出到另一会话再切回，重复两次：回合未分裂——单一「处理中…／正在处理 · 22秒 → 28秒」连续推进，工具进度按序前进（建立三个待办事项 → 查看是否已有待办清单），只有一条流式光标。
- 回合结束后再次重开：渲染项内容与顺序完全一致（助手答复 / 用户提示 / 助手「收起1个步骤 完成了 8 步操作」），仅窗口绝对索引基数出现 ±1 偏移（窗口化列表偏移，非分段变化）。工具段与用户消息段均保持。
- 按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。

### 未运行及原因

- 真实 Desktop 切会话实机冒烟：本批不做实机/视觉验证；重开全链（IPC+主进程 history）由 impact 覆盖的 245 例既有回归与纯函数合同共同佐证，实机体验待用户验收。

### 剩余风险

- 折叠按「两边最后 user 一致」判定回合边界；若运行回合的 user 消息尚未持久化而 canonical 尾是上一回合 assistant，不折叠（保守不动作，行为与修复前一致，不引入新错位）。
- refresh 场景（同会话内历史重载）同样受益于折叠；未单列 refresh 专属测试，按重开合同覆盖。
