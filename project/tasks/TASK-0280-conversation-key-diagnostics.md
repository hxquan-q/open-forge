---
id: TASK-0280
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0123
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0123]
execution: serial
branch: main
worktree: 未拆出（串行小改，main 直接实施）
base_commit: d6b471a88
read_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx, apps/desktop/src/renderer/domains/conversation/services/transcript-window.ts, apps/desktop/src/renderer/shared/conversation/item-key.ts, apps/desktop/src/renderer/shared/store/chat-atoms.ts]
write_paths: [apps/desktop/src/renderer/domains/conversation/services/conversation-key-diagnostics.ts, apps/desktop/src/renderer/domains/conversation/services/conversation-key-diagnostics.test.ts, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.test.tsx, .github/release-notes/v0.1.3.md, project/tasks/TASK-0280-conversation-key-diagnostics.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/services/conversation-key-diagnostics.ts, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListView.tsx]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 消息列表重复 key 的结构化诊断（零行为变更）

## 目标

把不稳定的 React 通用重复 key 告警换成结构化诊断：重复键、次数、每个重复项的身份字段与数组下标、所属会话，用来一次钉死「哪两个来源、哪一层」产生重复。**本轮只加测点，不改去重逻辑**（BUG-0123 待调查）。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 可并行 Task：无（`MessageListView.tsx` 与会话消息列表域串行）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：`main`
- Worktree：未拆出
- 集成负责人：本轮执行者
- 集成顺序：本 Task 单独落地，main 串行

### 做

- 新增 `services/conversation-key-diagnostics.ts`：`findDuplicateConversationKeys(items)` 纯函数 + `reportDuplicateConversationKeys(sessionId, items)` 出口（仅在有重复时 `console.warn`）。
- `MessageListView.tsx`：对 `messages` 变化运行一次诊断（`useEffect`），覆盖全部 feed（会话 / 团队 / work）。
- 测试：纯函数表驱动；`MessageListView.test.tsx` 增组件层断言（有重复时发出、无重复时不发）。
- `.github/release-notes/v0.1.3.md` 补一条内部改动。

### 不做

- 不改 `prependTranscriptPage` / `reconcileWindowedProjection` 的去重行为（BUG-0123 唯一路径未隔离，证据不足前不动实现）。
- 不新增 `renderKey`（`item-key.ts` 的 `renderKey` 设计意图是跨会话聚合；普通会话补 `renderKey` 会换对象身份、触发 React 重挂，`transcript-window.ts:437-438` 已记载该代价）。
- 不记录消息正文/文本内容（只记身份字段，遵守日志隐私边界）。

## Given / When / Then

- Given：消息列表中存在两个渲染键相同的项。
- When：`MessageListView` 渲染这批消息。
- Then：`console.warn` 发出结构化诊断，含重复键、次数与每项 `{index, kind, id, entryId, renderKey, role}`，并经既有 renderer console → render 日志转发落盘。

- Given：列表渲染键唯一。
- When：`MessageListView` 渲染。
- Then：不发出任何诊断（不产生常态噪音）。

## 必须保持

- 列表渲染行为、键计算（`conversationItemRenderKey`）与 Virtuoso 身份（`messageCollectionIdentity`、`useMessageVirtualizerKey`）完全不变。
- 诊断不读取、不输出消息正文。
- 无重复时零输出。

## 测试与验证

- 定向测试：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/conversation/services/conversation-key-diagnostics.test.ts src/renderer/domains/conversation/components/message-list/MessageListView.test.tsx`（包内）。
- 用户流程：长会话向上翻页加载更早历史 → 观察 render 日志出现结构化诊断而非裸 React 告警。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check:quick`，完成后 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行；与 frontmatter `integration_status` 一致。
- 人工功能验收：待验收（需真实长会话翻页复现重复 key）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：打开长会话并向上滚动触发更早历史翻页。
- 操作步骤或 AI 任务输入：无（自然浏览）。
- 预期行为与最终产物：render 日志出现 `[conversation-keys] duplicate render keys` 结构化诊断，能读出重复的两个来源。
- 不通过表现与已知限制：仍只有 React 通用告警；或诊断不含足够身份字段。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：
  - `services/conversation-key-diagnostics.ts`（新增）：`findDuplicateConversationKeys`（纯函数，按 `conversationItemRenderKey` 分组，返回键、次数与每项 `{index, kind, id, entryId?, renderKey?, role?}`）、`reportDuplicateConversationKeys`（仅在有重复时 `console.warn`，载荷含 `sessionId` / `total` / `duplicates`）。
  - `components/message-list/MessageListView.tsx`：新增一个 `useEffect`，`messages`/`sessionId` 变化时运行诊断；覆盖全部 feed。
  - 测试：`conversation-key-diagnostics.test.ts`（新增，7 例：唯一、同 entryId 重复、三项、多组、renderKey 优先、有重复告警载荷、无重复零输出）；`MessageListView.test.tsx`（增 2 例：有重复时发出、唯一时不发；`beforeEach` 补 `vi.restoreAllMocks()`）。
  - `.github/release-notes/v0.1.3.md`：`## 其他` 新增一条内部改动。
- 实际运行：
  - 包内 `bun ../../scripts/quality/run-vitest.mjs --run <两个测试文件>`：2 文件 / 22 例全绿。
  - `bun run --cwd apps/desktop typecheck:incremental`：通过。
  - `bun run test:impact -- <两个改动文件>`：desktop 侧 30 文件 / 137 例全绿。
- 未运行及原因：`verify:ui:*` 未获授权；真实长会话翻页复现重复 key 交人工验收。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：
  - 只加诊断、未改去重逻辑——重复仍会发生，仅可定位（符合 BUG-0123 本轮范围）。
  - 诊断在每次 `messages` 身份变化时做一次 O(n) 扫描；长列表下为一次性线性开销，且有重复时才输出，健康列表零成本可忽略。
  - 生产构建同样输出（renderer console → render 日志），便于从用户日志定位；不记消息正文。
