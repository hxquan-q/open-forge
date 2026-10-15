---
id: TASK-0083
type: task
status: done
priority: P2
owner: apps/desktop renderer/workspace-mode + i18n
requirement: REQ-0001
plan: PLAN-0001
source: ISSUE-0010 follow-up; user-request 文档与研究/代码
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/shared/i18n/locales, apps/desktop/src/renderer/domains/workspace-mode, apps/desktop/src/renderer/domains/conversation/components/input-bar]
write_paths: [apps/desktop/src/shared/i18n/locales/zh/chat.json, apps/desktop/src/shared/i18n/locales/en/chat.json, apps/desktop/src/renderer/domains/workspace-mode/lib/workspace-mode-copy.test.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarView.test.tsx, project/tasks/TASK-0083-workspace-mode-task-type-copy.md, project/issues/ISSUE-0010-dual-mode-switcher-interference.md, project/requirements/REQ-0001-work-coding-mvp.md]
exclusive_paths: [apps/desktop/src/shared/i18n/locales/zh/chat.json, apps/desktop/src/shared/i18n/locales/en/chat.json]
depends_on: [TASK-0077]
conflicts_with: [TASK-0077, TASK-0080]
integration_status: pending
created: 2026-09-24
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 工作区两档改称任务类型：文档与研究 / 代码

## 目标

页头开关与会话徽标改用「这份活是文档/研究还是代码」，不再用「办公 / 编程」这种职业身份词。内部三轴 id 仍是 `work` / `coding`。

## 用户语言推演

用户打开项目页头是为了**选这次任务落在哪类工作台**，不是声明自己是白领还是程序员。REQ-0001 的 work 是文档、批处理、研究、数据；coding 是仓库、Diff、Git、Shell。可见词应对齐任务对象。

## 范围

### 并发评估

- 结论：不支持与改同一 chat catalog / 徽标接线的 Task 并行
- 执行方式：serial
- 可并行 Task：无（与 TASK-0080 共享 session-axes 测试文案）
- 前置依赖：TASK-0077（单一开关已落地）
- 冲突文件/独占路径：`zh/en chat.json` 的 `workspace.mode` 与 `session.axes`
- Branch / Worktree：`forge/dev` 主工作区
- 集成负责人：本工作区
- 集成顺序：本 Task 单独合入

### 做

- `workspace.mode.work/coding`：中文「文档与研究 / 代码」，英文 `Docs & research / Code`。
- `session.axes`：解释轴「文档向 / 代码向」，工具面「文档与研究 / 代码」；英文 `document-oriented / code-oriented` 与 `docs & research / code`。
- 用 catalog 合同测试锁定上述词，输入栏徽标测试改读真实 zh catalog。

### 不做

- 不改 `agentMode` / `capabilityProfile` / `WorkspaceMode` 取值或派生。
- 不改 `settings.agentMode`（已从新会话默认路径拿掉）。
- 不写继承的 Vetta `v0.5.59` Release Notes（ISSUE-0007 门禁）。
- 不改图标、布局或第三档模式。

## Given / When / Then

- Given：用户打开带项目 cwd 的页头；When：看分段控件；Then：两档是「文档与研究」和「代码」，不是「办公」或「编程」。
- Given：已固化 work/work 的会话；When：输入栏渲染徽标；Then：文案为「本会话：文档向 · 文档与研究 工具集」。
- Given：`(work, coding)` 分歧会话；When：徽标渲染；Then：解释仍是文档向，工具面是代码，两标签可分。

## 必须保持

- 切页头不改已开会话工具与提示词。
- 新会话仍从当前工作区同时派生双轴。
- 徽标模板仍由 i18next 插值，`formatSessionAxesBadge` 不做第二遍替换。

## 测试与验证

- 定向：`workspace-mode-copy.test.ts`、`InputBarView.test.tsx`、`session-axes.test.ts`
- 用户流程：页头两档文案 + 输入栏徽标取自同一份 zh catalog
- 质量检查：`bun run check:quick -- <files>`

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

【改进】项目页头和工作会话徽标改为「文档与研究 / 代码」，按任务类型区分工作台，不再用「办公 / 编程」。

## 交付记录

- 实际修改：`zh/en chat.json` 的 `workspace.mode` 与 `session.axes`；新增 `workspace-mode-copy.test.ts` 锁定任务类型文案；`InputBarView.test.tsx` 改读真实 zh catalog，并对 theme-ui 双 React 做透传 mock。`ISSUE-0010` / `REQ-0001` 补关联。
- 实际运行：`workspace-mode-copy` 3、`session-axes` 12、`InputBarView` 4，均通过。Biome 对本切片测试/文案文件通过。
- 未运行及原因：`verify:ui:*` 需用户授权；全量 `bun run check` 被工作区其他 WIP 污染；`check:quick` 的 guards 被既有 `Capability Catalog documentation is stale` 打断，与本文案无关。`WorkspaceModeSwitcher.test` 挂载真实 `SegmentedControl` 时仍撞 theme-ui 双 React（本切片未改该文件）。
- 剩余风险：页头「文档与研究」五字偏长，窄栏可能折行；`settings.agentMode` 仍是「工作 / 编程」，但已不在新会话默认路径。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【改进】项目页头和工作会话徽标改为「文档与研究 / 代码」，按任务类型区分工作台，不再用「办公 / 编程」。
