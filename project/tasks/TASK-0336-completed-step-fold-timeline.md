---
id: TASK-0336
type: task
status: ready
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0014
source: user-request; RESEARCH-0029; upstream 30843391b
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0335, TASK-0337, TASK-0338]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 218f07776
read_paths:
  - packages/theme-ui/src/chat
  - apps/desktop/src/renderer/domains/conversation
  - apps/desktop/src/shared/i18n/locales
  - project/tasks
  - .github/release-notes
write_paths:
  - packages/theme-ui/src/chat/AssistantMessageView.tsx
  - packages/theme-ui/src/chat/index.ts
  - apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessage.tsx
  - apps/desktop/src/renderer/domains/conversation/components/message-list/types.ts
  - apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessageView.test.tsx
  - apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessage.waiting.test.tsx
  - apps/desktop/src/renderer/domains/conversation/components/message-list/RenderingScopes.test.tsx
  - apps/desktop/src/renderer/domains/conversation/hooks/useAssistantMessageModel.ts
  - apps/desktop/src/shared/i18n/locales/zh/chat.json
  - apps/desktop/src/shared/i18n/locales/en/chat.json
  - project/tasks/TASK-0336-completed-step-fold-timeline.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/theme-ui/src/chat/AssistantMessageView.tsx
  - apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessage.tsx
depends_on: []
conflicts_with: [TASK-0335, TASK-0337, TASK-0338]
integration_status: pending
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 已完成消息步骤折叠与时间线视觉层级

## 目标

按上游 `30843391b`（style(chat): 优化已完成消息步骤折叠与展开时间线视觉层级）同步已完成回复的折叠交互：默认收起；收起态标题改为加粗「已完成」并带虚线下划线；展开后用左侧竖线时间线与「完成」结束节点承载过程步骤；过程与最终回答分段渲染，避免回答被过程容器吞掉。本 Task 只吸收该交互与视图层，不跟进上游消息列表整体重构（RESEARCH-0029 已否决整体同步）。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0335/0337/0338 共享 Tasks 索引与 Release Notes。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`AssistantMessageView.tsx` 与桌面 `AssistantMessage.tsx` 为本 Task 独占；i18n、索引与发布说明共享。
- Branch：`main`。
- Worktree：不拆出；主题视图与桌面接线紧耦合，串行修改避免跨 commit 半成品。
- 集成负责人：当前 Coordinator。
- 集成顺序：TASK-0335 之后、TASK-0337 之前。

### 做

1. `packages/theme-ui/src/chat/AssistantMessageView.tsx`：完成态折叠头改为加粗标签 + 虚线底纹 + 尾部 chevron；新增 `AssistantMessageProcessContainer`（左侧竖线、内容缩进、底部「完成」节点）；经 `AssistantMessage` 对象与 `chat/index.ts` 导出。
2. 桌面 `AssistantMessage.tsx`：默认折叠（`useExpansion(..., false)`）；用 `AssistantMessageProcessContainer` 包裹过程段；最终回答段保持在容器外；接入 `processSegments` / `answerSegments`。
3. `useAssistantMessageModel.ts` 与 `types.ts`：新增过程/回答分段计算并返回；保留导出模式、流式态、pin approved plan、自定义工具名与独立工具调用语义。
4. i18n：`assistantFoldTip.work.*` 四个动作文案改为「已完成/Completed」，新增 `done`（完成/Done）；同步 zh/en。
5. 适配上游测试变更：默认折叠、展开时间线、等待态与渲染作用域断言。
6. 更新 Tasks 索引、本 Task 交付记录与当前版本发布说明。

### 不做

- 不整体同步 ADR-0146/0147 的消息列表重构，不改 feed/投影/滚动架构。
- 不改变流式消息、进行中工具、审批卡片、导出模式的既有行为。
- 不引入上游新增的无关组件或品牌文案。
- 不启动 Desktop、不运行 `verify:ui:*`。

## Given / When / Then

- Given 一条已完成的助手消息含多个过程步骤，When 首次渲染，Then 过程默认收起，标题为加粗「已完成」并带虚线底纹，尾部显示展开箭头。
- Given 用户点击「已完成」，When 过程展开，Then 过程步骤显示在左侧竖线时间线内，底部出现「完成」节点；最终回答位于时间线之外。
- Given 消息仍在流式输出，When 渲染，Then 保持现有流式展示，不套用完成态折叠或时间线。
- Given 使用导出模式或审批计划置顶，When 计算分段，Then 导出内容完整且置顶计划仍按既有规则保留。
- Given 切换中/英文，When 查看折叠头与结束节点，Then 文案分别来自 zh/en 且无硬编码中文。

## 必须保持

- 消息、工具调用、错误、审批与 usage 的渲染语义不变。
- 流式态、导出态、自定义工具名与 `standaloneToolCallIds` 行为不变。
- `AssistantMessageModel` 现有字段的消费者不被破坏；新增字段为可选或同步更新全部消费者。
- 仅使用 `packages/theme-ui` 公开出口，不深链 `src/**`。
- 不删除既有断言、不跳过失败用例。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessageView.test.tsx apps/desktop/src/renderer/domains/conversation/components/message-list/AssistantMessage.waiting.test.tsx apps/desktop/src/renderer/domains/conversation/components/message-list/RenderingScopes.test.tsx`。
- 主题视图测试：`bun scripts/quality/run-vitest.mjs --run packages/theme-ui/src/chat`（如存在同目录测试）。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：组件测试覆盖「完成消息默认收起 → 点击展开 → 时间线与完成节点 → 回答在容器外」；无需真实模型。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审；对照上游视图差异与本仓模型字段。
- 集成：待提交并推送 `origin/dev`。
- 人工功能验收：待验收；用户可在会话中查看已完成回合的折叠与展开。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 任一已完成助手回复。
- 操作步骤或 AI 任务输入：观察默认折叠态；点击「已完成」展开。
- 预期行为与最终产物：默认收起，展开后左侧时间线与底部「完成」节点可见，最终回答独立显示。
- 不通过表现与已知限制：默认展开、回答被包进时间线、流式消息被误折叠或文案未翻译。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：待回填。
- 实际运行：待回填。
- 未运行及原因：待回填。
- Worktree：未拆出；主题视图与桌面接线串行修改。
- 剩余风险：待回填。
