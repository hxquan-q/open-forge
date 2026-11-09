---
id: TASK-0478
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0477]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ad033ff5d
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/conversations/user-question-broker.ts
  - apps/desktop/src/main/conversations/plan-review-broker.ts
  - packages/coding-agent/src/features/ask-user-question/tool/ask-user-question-tool.ts
write_paths:
  - packages/host-protocol/src/domains/session-interaction.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-interaction-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0478-session-interaction-host-domain.md
exclusive_paths: []
depends_on: [TASK-0477]
conflicts_with: []
integration_status: pending
created: 2026-11-09
updated: 2026-11-09
---
<!-- Copyright The Open Forge contributors. -->

# 问答与计划评审应答子域迁移到 Host 合同（TASK-0465 组 3）

## 目标

`vetta:session:{question-list-pending,question-response,plan-review-list-pending,plan-review-response}` 四通道迁为 `session.*` Host 方法，renderer 签名不变，旧 handler 删除；IPC 626 → 622。

## 做

- `domains/session-interaction.ts` 四方法合同：`listPendingQuestions`/`respondToQuestion`/`listPendingPlanReviews`/`respondToPlanReview`。问答请求按 tool schema 字段全量钉定（`questions[{question,header,options[{label,description,badges?}],multiSelect?}]`），plan-review 为 `{requestId,sessionId,plan}`；应答 `result` 用 `Type.Unknown()` —— 不可信 renderer 输入由 broker 的 `normalize*` 收窄。
- `host/session-interaction-domain.ts` 薄桥接两个 broker（与旧 handler 同职责）；desktop-host 注册第十五领域；host-transport union 扩 `SessionInteractionHostMethods`；preload 4 处改 `host.call`；`ipc/session.ts` 删 4 handler、4 枚举项并更新迁移注释。
- 测试：注册清单补 4 个方法名（`listPendingPlanReviews/listPendingQuestions/respondToPlanReview/respondToQuestion`）。

## 不做

- 不迁移问答/评审的五个推送面（`question-request`/`question-resolved`/`plan-review-request`/`plan-review-resolved`/`pending-question-changed`）：broker/domain 需要在没有在途 Host 调用时主动推送 renderer，事件面按 TASK-0465 顺序另片处理；quick-panel 共享的 `pending-question-changed` 保持不变。

## Given / When / Then

- Given 任意待答/待评审状态 / When 四方法经 Host 合同调用 / Then 结果与旧通道一致；应答经 broker 既有 normalize 与 identity 守卫；旧 4 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、user-question-broker、preload session）；`check:quick`；根 `tsgo` + `apps/desktop typecheck`（并入 `bun run check`）；`test:impact`；`count-ipc-channels` 626 → 622。

## 交付记录

- 实际修改（2026-11-09）：如"做"所列；Phase A（`ad033ff5d`）已把 `DesktopUserQuestionBroker` 改为 presenter 模型，本片只换合同入口，不触碰 broker 语义。
- 踩坑记录：desktop 测试消费 `@vetta/host-protocol` 的 `dist`，新增域后须先 `bun run --cwd packages/host-protocol build`，否则注册值为 `undefined`（`Cannot convert undefined or null to object`）。
- 实际验证：`check:quick` exit=0（ratchet new=0）；`bun run check` exit=0（root tsgo、desktop/mobile/docs/cli typecheck、guards 全绿）；`count-ipc-channels` 626 → 622；定向 `user-question-broker` + `preload session` 18 例通过；`test:impact` 全量通过（host-protocol 19 例，desktop 1126 文件 / 6364 例，跳过 4 文件 / 18 例，exit=0）。定向单跑 `desktop-host` 时有 4 例依赖完整套装环境的 mock 失败，全量套件未复现。
- 未运行与风险：五个推送通道保持旧 IPC（事件面另片）；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
