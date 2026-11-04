---
id: TASK-0439
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0006
plan: PLAN-0028
source: BUG-0177（用户实机验收反馈）
related_requirement: [REQ-0006]
related_plan: [PLAN-0028]
related_tasks: [TASK-0438]
related_issues: []
related_bugs: [BUG-0177]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: fb4206f3c
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.test.tsx
  - project/tasks/TASK-0439-handoff-failure-loop.md
  - project/tasks/README.md
  - project/bugs/BUG-0177-handoff-failure-loop.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.4/bug-0164-handoff-failure-loop.md
exclusive_paths: []
depends_on: [TASK-0438]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Team 首发 handoff 失败不再自动重发（BUG-0177）

## 目标

创建失败的 handoff 不自动重武装，阻断发送风暴；同时失败必须进入可见、可编辑、可手动重试的终态。显式重试可使用用户修改后的草稿/文件引用，且仅由用户动作触发一次新的创建尝试。

## Given / When / Then

- Given Team 首发创建因确定性错误失败，When 失败回填草稿/文件引用，Then 不自动重发，显示错误且编辑器可用。
- Given 用户修正草稿/附件后再次发送，When 显式重试，Then 只发生一次新的创建尝试并使用当前输入；成功后进入新会话，失败后仍可再次手动尝试。

## 必须保持

- 创建失败不能因 React effect/草稿回填自动重试。
- 正常 handoff 仍在 session shell 首屏提交后发送，成功后清除 handoff。
- StrictMode effect 重放不能复制同一请求。

## 测试与验证

- Team hook 流程：红测覆盖旧实现“失败后按钮不可用/手动重试无效”；验证修改草稿与附件后重试采用新输入。
- 失败观察窗确认无自动重试；正常 handoff 与 StrictMode 回归保持通过。
- `check:quick`；完整 `bun run check` 留本批收尾。

## 交付记录

- 原自动重试风暴修复已在 `fb4206f3c` 落地；本次续接：保留 handoff one-shot claim 阻断 effect 重发，失败态不再伪装成 sending/待处理；用户手动重试时从当前草稿与文件引用重建请求，使用新 requestId；若记录已创建而后续准备步骤失败，则先恢复该 session 再展示错误。
- 实际运行：红测先因旧实现停在 `status: sending` 失败；修复后 `useTeamChatModel` + `TeamChatFailureTerminalLoop` 35/35；`test:impact` direct 37/37、related 117/117；`bun run check:quick`、Desktop typecheck、完整 `bun run check` 通过。
- 未运行及原因：未启动用户 Desktop 做实机复验。
- Worktree：未拆出（主检出串行）。
- 剩余风险：本次未实机复验 Team 新会话首发失败后的手动重试视觉流程。
