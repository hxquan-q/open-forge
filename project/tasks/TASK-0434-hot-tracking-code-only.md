---
id: TASK-0434
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 报告 §11.3 用户决策（2026-10-30）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0425]
related_issues: []
related_bugs: []
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 21afd97d8
read_paths:
  - apps/desktop/src/renderer/domains/activity-panel
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/components/chat-view/DefaultChatView.tsx
  - apps/desktop/src/renderer/domains/conversation/components/new-session/NewSessionPageView.tsx
  - project/requirements/REQ-0030-allstar-dev-section.md
write_paths:
  - apps/desktop/src/renderer/domains/activity-panel/components/ActivityPanel.tsx
  - apps/desktop/src/renderer/domains/activity-panel/components/activity-panel/types.ts
  - apps/desktop/src/renderer/domains/activity-panel/registry/context.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiActivity.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiActivity.test.tsx
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/domains/activity-panel/components/ActivityPanel.plugin-tabs.test.tsx
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.terminal-settle.test.tsx
  - apps/desktop/src/renderer/domains/conversation/components/chat-view/DefaultChatView.tsx
  - apps/desktop/src/renderer/domains/conversation/components/new-session/NewSessionPageView.tsx
  - project/requirements/REQ-0030-allstar-dev-section.md
  - project/tasks/TASK-0434-hot-tracking-code-only.md
  - project/tasks/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/task-0416-hot-tracking-code-only.md
exclusive_paths: []
depends_on: [TASK-0431]
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# LLM 行为热追踪收敛为 code 模式独有（REQ-0030 / 报告 §11.3）

## 目标

生产端与消费端同批收敛：非 coding 档单会话不写全局编辑目标/终端 feed；非 coding 挂载点不执行热跟随、不显示 AI 终端回放页签。团队会话天生 coding 档维持现状。该收敛缩小 F03/F05 的暴露面但不替代其会话所有权修复（F03 另片执行）。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0028 第 9 片，主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：ActivityPanel 族 + 事件泵，均本批前序切片已完成，无并行。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0028 第 9 片。

### 做

1. 生产端：`useSessionEventController` 的 tool.start 投影（编辑目标 + 终端入队）按 `activeSessionRef.capabilityProfile === "coding"` 门控；团队泵不动。
2. 消费端：`ActivityPanelProps` 增 `hotTracking?: boolean`（默认 false）——false 时不挂 `useFollowAiActivity`、内置定义滤除 `terminal` 页签；Context 增 `hotTracking`，`useFollowAiFileEdits` 据此短路。
3. 挂载点接线：DefaultChatView 两分支 `hotTracking={coding}`；NewSessionPageView 按项目档位；ProjectDetailPage 默认 false；ConversationActivityPanel 按 activeSession 档位。
4. REQ-0030 补验收边界（code-only 热追踪 + 行为取舍）；发布碎片写明 work 会话不再投屏/跟随的可见变化。

### 不做

- 不动团队泵（TEAM_CAPABILITY_PROFILE 恒 coding）；
- 不做 feed/编辑目标的会话身份隔离（F03 后续切片）；
- 不删 AiTerminalReplayPanel 与 atoms（coding 语境照常使用）。

## Given / When / Then

- Given work 档会话执行 bash/写类工具，When tool.start 到达，Then 全局 feed/编辑目标不写入（红）。
- Given coding 档会话，When 同上，Then 照常投屏。
- Given 非 coding 挂载点（work 手开面板/项目详情页/非 coding 新会话页），When 全局有 AI 活动，Then 页签不跟随、terminal 页签不出现。
- Given coding 挂载点，Then 跟随与 terminal 页签照常。

## 必须保持

- 团队会话热追踪行为不变；
- coding 会话的完整热跟踪链（投屏/跟随/浏览器跟随）不变；
- F06 的 end 结算提升语义不变（end 结算仍先于闸门，只是非 coding 的 start 不再入队，end 自然 no-op）。

## 测试与验证

- 生产端红：work 档 tool.start 不写 feed/编辑目标（terminal-settle 测试文件扩展，含 coding 对照）。
- 消费端红：useFollowAiActivity disabled 不跟随；ActivityPanel 默认无 terminal 页签、hotTracking 有。
- 定向：上述 + plugin-tabs/terminal-tab/DefaultChatView 相关既有套件。
- `check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户实机（work 会话不再看到 AI 命令投屏）。发布：未授权。

## 交付记录

- 实际修改：生产端 `useSessionEventController` 的 tool.start 投影按 `capabilityProfile === "coding"` 门控（团队泵不动）；消费端 `ActivityPanelProps.hotTracking`（默认 false）+ Context 增 `hotTracking`（默认 false）+ 非 hot 挂载滤除 `terminal` 内置页签 + `useFollowAiActivity(workspace, enabled)` / `useFollowAiFileEdits`（Context）短路；挂载点接线 DefaultChatView 两分支 `hotTracking={coding}`、NewSessionPageView 按项目档位、ProjectDetailPage 默认 false、ConversationActivityPanel 按 activeSession 档位；REQ-0030 补不变量与关联；types.ts 补 fork 声明头。
- 实际运行：红 3（work 不投屏 / disabled 不跟随 / 默认面板无 terminal 页签）→ 绿；全套件 24/24（file-edits 5 含新增 disabled 用例、terminal-tab、plugin-tabs 6、follow-activity 5、terminal-settle 4、DefaultChatView×2）；`check:quick` 通过（ratchet new=0，首轮 types.ts 缺头已补）。批次收尾完整 `bun run check` 首轮抓出三处类型问题并已修：Context `hotTracking` 改可选（兼容既有测试字面量，缺省 false 兜底）；生产端门控改读 `activeSessionAtom`（`ActiveSessionHandle` 不携带 capabilityProfile，测试挂具同步设 atom）；团队 end 结算闭包提取 `endResult` 局部（联合窄化不进闭包）。复跑后完整 check exit 0。
- 未运行及原因：完整 check 与 impact 留批次收尾；DefaultChatView/NewSessionPage 的 prop 接线未单测（面板级与 hook 级合同已锁，接线由 tsc 保证）；实机 work 会话验收待用户。
- Worktree：未拆出（主检出串行）。
- 剩余风险：feed/编辑目标仍为全局共享（code↔code 跨项目隔离 = F03 后续切片）；F06 的 end 结算对非 coding 会话自然 no-op（start 不入队）。
