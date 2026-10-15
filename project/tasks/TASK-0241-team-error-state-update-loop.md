---
id: TASK-0241
type: task
status: verifying
priority: P1
owner: apps/desktop conversation（team 会话渲染）
requirement:
plan:
source: BUG-0101
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0101]
execution: serial
branch:
worktree:
base_commit: 9021b1d28
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/
  - apps/desktop/src/renderer/domains/conversation/components/input-bar/
write_paths:
  - apps/desktop/src/renderer/domains/conversation/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-13
updated: 2026-10-13
---
<!-- Copyright The Open Forge contributors. -->

# 修复团队会话失败终态的同步渲染循环（BUG-0101）

## 目标

定位并修复：团队会话中回合进入失败终态（send IPC 悬挂 + discard reason=failed 组合态）后渲染层触发 `Maximum update depth exceeded`（React 同步嵌套更新 >50）导致整页崩为路由错误页。

## 范围

### 并发评估

- 结论：条件支持（读面广、写面集中于 conversation 渲染域）
- 执行方式：serial
- 可并行 Task：无（本 Task 串行实施）
- 前置依赖：无
- 冲突文件/独占路径：无（`write_paths` 仅 conversation 渲染域；TASK-0240 写 SSH/desktop 传输面，无交集）
- Branch：main（本地，串行）
- Worktree：不需要（单会话串行）
- 集成负责人：本会话
- 集成顺序：独立修复，无依赖

### 做

- 建立组件级复现：真实 `TeamComposerConnector`→`InputBar`→Lexical 接线 + 真实 `useTeamChatModel`，驱动「现有会话 → 发送（IPC 悬挂）→ 流事件 → discard(failed)」，在旧实现上稳定失败。
- 由复现定位循环源头并做最小修复；回归测试入库。

### 不做

- 不改 provider 停滞级联时序（BUG-0085/TASK-0223 已收口）。
- 不改主进程 send IPC 长驻问题（另行记录）。
- 不为假想路径加防御性重构。

## Given / When / Then

- Given：现有团队会话页，模型加载完成，composer 可用。
- When：用户发送一条消息（send IPC 悬挂不返回），leader 收到 text_delta 后连接死亡，最终 `conversation.agent-message-discard`（reason=failed）到达。
- Then：UI 呈现失败错误卡片、pending 指示按合同处理、输入区状态正确；全程无 `Maximum update depth exceeded`、无无界重渲。

## 必须保持

- 回合失败/取消/成功的既有呈现合同（错误卡片、失败成员标记、draft 恢复）。
- BUG-0084 的受控投影判等合同（编辑器不得因投影元数据差异重建内容）。
- 团队会话与单智能体会话共用 InputBar 的行为不变。

## 测试与验证

- 定向测试：新增回归测试（先红后绿）+ 现有 team 套件（`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/connectors/team/`）。
- 用户流程：失败终态到达后页面稳定、错误可见、可继续输入/重发。
- 质量检查：`bun run check:quick`；完成后 `bun run check`；impact/changed 按改动面执行。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待验收（实机死连接场景按 BUG-0085 态 B 复现步骤由用户执行）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：团队会话页；Debug Profile 或可杀死的夹具 provider。
- 操作步骤或 AI 任务输入：发消息 → 流式中杀 provider → 等终态（≤2×180s+余量）。
- 预期行为与最终产物：错误卡片出现、页面不崩、可重发。

## 交付记录

- 2026-10-13（工程完成）：
  - **根因**（实机复现取得完整组件栈，证据 `<artifactDir>/debug/bug-0101/renderer-console-crash.log`）：`TeamMemberRoster` 成员胶囊条测量循环——① 测量 effect 依赖 `members` 数组身份（每个流事件都换新）⇒ 每事件重挂 ResizeObserver + 重排 rAF；② `setLabelWidths` 每次写新对象，亚像素反馈下永不收敛。高频流事件（qwen3.8 正常流式 ~78s）即触发 React 50 次同步嵌套更新上限；事故的 7 分钟静默是停滞级联，崩溃落在终态突发。触发面修正：非「失败终态专属」，而是「流事件高频 + 真实布局」。
  - **修复**（`TeamMemberRoster.tsx`）：`sameTeamMemberLabelWidths`（≤0.5px 等价判敛）+ 函数式 setState 等价保持引用；effect 依赖改 `measurementKey`（成员 id:名 + 队长角标），成员经 `membersRef` 读取。
  - **回归测试**：`TeamMemberRoster.test.tsx` +3（亚像素收敛红→绿、churn 不重排红→绿〔旧实现 60 事件 61 observer〕、改名仍重排）；新增 `TeamChatFailureTerminalLoop.test.tsx`（真实 Router/TeamChatPage/composer/Lexical/聊天壳/胶囊条 + 终态突发稳定性契约，jsdom 无法复现崩溃但守住整树接线）。
  - **实机验证**（用户授权，Debug Profile 隔离实例）：修复前 qwen 流式 78s 崩溃复现；修复后同会话 qwen 流式 31.7s 回合 + 委派回合 4 分钟+均无 `Maximum update depth`、页面完好；夹具（`~/.openforge-ui-debug/04987e4e/fixtures/bug-0101/stall-server.ts`，本地停滞 provider）留档可复用。注：验证期间编排续跑消耗过用户默认模型约 3-4 分钟生成（发现即停），qwen3.8 为用户点名使用。
  - **门禁**：team 套件 155 例全绿；desktop typecheck、biome 通过；`check:quick` 因 21 条基线外缺声明头的**已提交他人文件**（TASK-0235-0239 批次等）保持既有红，非本任务引入；本任务文件均带声明头。
- 2026-10-13（调查过程，保留）：
  - 静态调查 + jsdom 真实接线复现未果 ⇒ 结论「崩溃依赖真实布局测量」，实机复现证实。
  - 顺带发现（独立缺陷，未在本任务修）：`useTeamChatModel` 的 `attachments ?? []`/`memberMentions ?? []` 每渲染新数组使 `send` 身份每渲染变化；叠加 send 早期失败 `releaseTeamSessionHandoff` 复位 `claimed`，可形成 handoff claim→send→失败→release→重claim 重试风暴（日志刷屏型，非本崩溃）。

## 验收分层（更新）

- 工程验证：通过（定向 155 例、typecheck、biome、实机复现→修复→不复现闭环）。
- 技术评审：自审。
- 集成：已推 origin/dev（`1c627a0f2..5587b31de` fast-forward，含 TASK-0240 验证反馈 docs 提交，未夹带未提交改动）。
- 人工功能验收：待验收（用户日常使用团队会话流式场景观察；崩溃属偶发高频事件型，无固定操作步骤）。
- 发布：未授权。
