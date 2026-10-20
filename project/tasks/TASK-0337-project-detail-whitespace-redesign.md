---
id: TASK-0337
type: task
status: verifying
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0014
source: user-request; RESEARCH-0025; upstream 3db9773b4
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0335, TASK-0336, TASK-0338]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 218f07776
read_paths:
  - packages/theme-ui/src/project
  - packages/theme-ui/src/activity
  - packages/coding-agent/src/resources
  - packages/coding-agent/src/model-context
  - apps/desktop/src/renderer/domains/project
  - apps/desktop/src/renderer/root-layout
  - apps/desktop/src/renderer/shared/app-shell
  - apps/desktop/src/shared/i18n/locales
  - project/tasks
  - .github/release-notes
write_paths:
  - packages/theme-ui/src/project/ProjectDetailPageView.tsx
  - packages/theme-ui/src/project/ProjectDetailPageView.test.tsx
  - packages/theme-ui/src/activity/MarkdownPreviewView.tsx
  - apps/desktop/src/renderer/domains/project/components/ProjectDetailPage.tsx
  - apps/desktop/src/renderer/domains/project/hooks/useProjectDetailPageModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjectDetailPageModel.test.tsx
  - apps/desktop/src/renderer/domains/project/hooks/useProjectInstruction.test.tsx
  - apps/desktop/src/renderer/root-layout/RootLayoutView.tsx
  - apps/desktop/src/renderer/shared/app-shell/session-open-context.tsx
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - packages/coding-agent/src/resources/runtime/context-resources.ts
  - packages/coding-agent/src/model-context/system-prompt-policy.ts
  - packages/coding-agent/test/context-resources-port.test.ts
  - packages/coding-agent/test/system-prompt.test.ts
  - project/tasks/TASK-0337-project-detail-whitespace-redesign.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/theme-ui/src/project/ProjectDetailPageView.tsx
  - apps/desktop/src/renderer/domains/project/hooks/useProjectDetailPageModel.ts
  - apps/desktop/src/renderer/shared/app-shell/session-open-context.tsx
depends_on: []
conflicts_with: [TASK-0335, TASK-0336, TASK-0338]
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 项目详情页去线留白重构与项目指令双视图

## 目标

按上游 `3db9773b4`（feat(project): 升级项目详情页设计并支持指令预览与 CLAUDE.md 加载）同步项目详情页：去掉卡片/分隔线外壳，改为去线留白布局；增加最近会话区块；项目指令支持 AGENTS.md / CLAUDE.md 标签、预览/编辑双视图与草稿保留；接入 `SessionOpenProvider` 使最近会话跳转复用全局打开会话语义；同时按同一提交把项目上下文加载改为同目录同时读取 CLAUDE.md 与 AGENTS.md，并在提示词中声明同目录 AGENTS.md 优先。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0335/0336/0338 共享 Tasks 索引与 Release Notes，且本 Task 跨 theme-ui / desktop / coding-agent 三层。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无；`resolveSessionOpenTarget`、`sessionDisplayLabel`、运行态与置顶会话原子均已存在。
- 冲突文件/独占路径：`ProjectDetailPageView.tsx`、`useProjectDetailPageModel.ts`、`session-open-context.tsx` 为本 Task 独占；`RootLayoutView.tsx`、i18n 与发布说明共享。
- Branch：`main`。
- Worktree：不拆出；跨包接线与测试需在同一工作区连续验证。
- 集成负责人：当前 Coordinator。
- 集成顺序：TASK-0336 之后、TASK-0338 之前。

### 做

1. `ProjectDetailPageView.tsx`：移除 motion 头部/卡片/分隔线外壳；新增最近会话列表（最多 5 条，空时隐藏或显示引导）；项目指令标签页（AGENTS.md / CLAUDE.md）；预览/编辑模式切换；编辑区使用 `min-h-[24rem] h-[32rem] resize-y bg-accent/15 rounded-lg p-4 font-mono text-[12.5px]`；空文件与开始编辑引导。
2. `MarkdownPreviewView.tsx`：增加可选 `className` 并合并现有内边距，供详情页对齐标题边界。
3. `useProjectDetailPageModel.ts`：新增 `useProjectInstruction(cwd, filename, enabled)`（加载/保存请求计数、`loadedPath`、无定时器）；`activeDocument` 与 `mode` 状态；最近会话、运行中会话/任务计数；`onDocumentChange` 与 `onOpenRecentSession`（经 `resolveSessionOpenTarget`，viewer 走 `/viewer/$path`，其余走 `onOpenSession`）；保留本仓 BUG-0033 的幂等 `loadSessions` 补偿扫描（直达/重载时侧栏组未展开也要拿到会话计数），任务计数按本仓 `ScheduledTask.cwd` 适配。
4. `ProjectDetailPage.tsx` 与 `RootLayoutView.tsx`：新增 `SessionOpenProvider` / `useOpenProjectSession`，在路由内容两侧注入 `onOpenSession`；新文件 `session-open-context.tsx`。
5. `context-resources.ts`：`loadContextFileFromDir` → `loadContextFilesFromDir`，同目录按 CLAUDE.md、AGENTS.md 顺序读取两者，祖先目录拍平；`system-prompt-policy.ts` 增加同目录 AGENTS.md 优先声明。
6. 适配/新增测试：`ProjectDetailPageView.test.tsx`、`useProjectInstruction.test.tsx`，更新 `useProjectDetailPageModel.test.tsx`、`context-resources-port.test.ts`、`system-prompt.test.ts`。
7. i18n 与记录：补齐 zh/en 项目详情文案；更新 Tasks 索引、本 Task 交付记录与发布说明。

### 不做

- 不整体同步上游项目页其他未列改动，不改项目 CRUD、侧栏项目树或会话删除语义。
- 不改变项目指令之外的 Prompt 优先级；不同目录的嵌套优先级保持既有规则。
- 不把 CLAUDE.md/AGENTS.md 合并成单一文件，不改变文件写入的原子性/编码合同。
- 不启动 Desktop、不运行 `verify:ui:*`、不读取真实用户项目目录。

## Given / When / Then

- Given 项目页含最近会话，When 打开详情页，Then 顶部无卡片/分隔线外壳，最近会话最多 5 条；无会话时该区块隐藏或显示空态而布局不留空洞。
- Given 项目同时存在 AGENTS.md 与 CLAUDE.md，When 加载项目页与 Agent 上下文，Then 两个标签均可查看/编辑；上下文两个文件都被读入，提示词声明同目录 AGENTS.md 优先。
- Given 用户在编辑区修改 CLAUDE.md 后切到 AGENTS.md，When 再切回，Then 未保存草稿仍在；保存只写当前文件。
- Given 文件不存在或为空，When 进入详情页，Then 显示空文件引导与「开始编辑」，不显示损坏预览。
- Given 用户点击最近会话，When 该会话的打开目标为 viewer，Then 导航到 `/viewer/$path`；否则调用注入的 `onOpenSession`，不复制会话打开逻辑。
- Given 上下文读取失败，When 加载，Then 保留其他可读文件并记录既有警告，不阻断项目页。

## 必须保持

- 项目详情页仍消费 `packages/theme-ui` 公开出口；不深链包内 `src/**`。
- `resolveSessionOpenTarget`、运行态原子、置顶会话与 `sessionDisplayLabel` 的既有语义不变。
- 会话打开上下文不建立第二套导航状态；`RootLayoutView` 原有路由与 provider 顺序保持可用。
- `loadProjectContextFiles` 的返回顺序保持祖先目录由浅到深，同目录 CLAUDE.md 在 AGENTS.md 之前；提示词声明优先关系，不删除任一文件。
- 既有测试断言不被削弱；新增行为有可失败覆盖。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/theme-ui/src/project/ProjectDetailPageView.test.tsx apps/desktop/src/renderer/domains/project/hooks/useProjectDetailPageModel.test.tsx apps/desktop/src/renderer/domains/project/hooks/useProjectInstruction.test.tsx`。
- coding-agent：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/context-resources-port.test.ts packages/coding-agent/test/system-prompt.test.ts`。
- 影响面：`bun run test:impact`；需要时 `test:changed`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：组件/Hook 测试覆盖最近会话跳转、标签切换草稿、预览/编辑切换、空文件引导、双文件上下文加载与 AGENTS 优先声明。
- 失败场景：文件读取失败、空文件、会话目标未知、切换标签时保存失败。

## 验收分层

- 工程验证：已完成；theme-ui `ProjectDetailPageView.test.tsx` 3 例、桌面项目 Hook 2 个文件 3 例、coding-agent 2 个文件 35 例通过；桌面与 coding-agent 类型检查通过；`check:quick` 通过（DESIGN 审计与声明头 ratchet `new=0`）。theme-ui 包级 `tsgo` 仍有与本 Task 无关的存量错误（`NewSessionPicker.tsx`、`BashTerminalCard.tsx` 等），本 Task 触及文件无新增报错。
- 技术评审：自审；逐项对照上游 `3db9773b4`，保留本仓 BUG-0033 会话扫描、`ScheduledTask.cwd`、DESIGN 门禁与 host 注入边界。
- 集成：实现提交 `39d28557c` 已集成 main；记录随本轮推送 `origin/dev`。
- 人工功能验收：待验收；用户可在真实项目页检查视觉、双文件编辑与最近会话跳转。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 打开任一含 AGENTS.md/CLAUDE.md 的项目详情页。
- 操作步骤或 AI 任务输入：切换文件标签与预览/编辑；修改后切换标签；点击最近会话。
- 预期行为与最终产物：无卡片/分隔线、留白布局；草稿保留；跳转行为与全局会话打开一致。
- 不通过表现与已知限制：旧卡片壳仍在、切换标签丢草稿、保存错文件、最近会话点击无响应或跳错目标。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `packages/theme-ui/src/project/ProjectDetailPageView.tsx`：按上游 `3db9773b4` 终态重写为去线留白布局——标题/指标/最近会话（最多 5 条、置顶与运行态）/AGENTS.md 与 CLAUDE.md 页签/预览编辑切换/空文件引导；4 处原生 `<button>` 改用 `@vetta-org/ui` 的 `Button` 以满足 D03，`transition-all` 改为 `transition` 以满足 D06；新增 `onOpenExternal` 宿主注入 prop。
  - `packages/theme-ui/src/activity/MarkdownPreviewView.tsx`：新增可选 `className` 并与默认内边距合并，供详情页对齐标题边界。
  - `packages/theme-ui/src/project/ProjectDetailPageView.test.tsx`（新增）：上游用例 + jsdom/声明头，3 例通过。
  - `apps/desktop/src/renderer/shared/app-shell/session-open-context.tsx`（新增）：`SessionOpenProvider` / `useOpenProjectSession`；`RootLayoutView.tsx` 在路由内容外注入 `onOpenSession`。
  - `ProjectDetailPage.tsx`：接入会话打开上下文，补齐最近会话、运行计数、文档/模式与外部链接 props。
  - `useProjectDetailPageModel.ts`：按上游模型重写 `useProjectInstruction`、`activeDocument`/`mode`、最近会话与运行计数、`onOpenRecentSession`；保留 BUG-0033 的幂等 `loadSessions` 补偿，任务计数改用本仓 `task.cwd`；`useProjectDetailPageModel.test.tsx` 与新增 `useProjectInstruction.test.tsx` 适配。
  - `packages/coding-agent/src/resources/runtime/context-resources.ts`：同目录同时读取 CLAUDE.md 与 AGENTS.md（CLAUDE.md 在前），祖先目录拍平；`context-resources-port.test.ts` 覆盖双读与不可读文件继续。
  - `packages/coding-agent/src/model-context/system-prompt-policy.ts`：声明嵌套更深优先、同目录 AGENTS.md 优先、对话指令最高；`system-prompt.test.ts` 增加同目录优先断言。
  - i18n zh/en `project.json`：补 `editorPlaceholderFile`、`claudeMdHint`、`context.title`、`recentSessions.*`、`runtime.*`、预览/编辑与空态文案；品牌中立表述。
  - 更新本 Task 记录、Tasks 索引与 0.1.3 发布说明。
- 实际运行：
  - `cd packages/theme-ui && bun run test src/project/ProjectDetailPageView.test.tsx`：3 例通过。
  - `cd apps/desktop && bun run test src/renderer/domains/project/hooks/useProjectInstruction.test.tsx src/renderer/domains/project/hooks/useProjectDetailPageModel.test.tsx`：2 files / 3 tests 通过。
  - `cd packages/coding-agent && bun run test test/context-resources-port.test.ts test/system-prompt.test.ts`：2 files / 35 tests 通过。
  - 桌面类型检查与 coding-agent `tsgo` 构建配置检查通过；`bun run check:quick` 通过。
  - `bun run test:impact` 通过：Desktop 977 files / 5293 tests、theme-ui 定向 3 + 5 tests。
- 未运行及原因：Desktop 实机 UI 验收与 `verify:ui:*` 未运行；本 Task 未获启动真实用户环境的授权。
- 质量检查：完整 `bun run check` 通过（exit 0；含 lint 4962 files、根 `tsgo`、Desktop `typecheck:incremental`、guards，ratchet `new=0`）。
- Worktree：未拆出；跨 theme-ui / desktop / coding-agent 串行接线。
- 剩余风险：最近会话区在无会话时整块隐藏；视觉留白与标签切换手感需人工在真实项目页确认。上下文双读默认让 CLAUDE.md 与 AGENTS.md 同时进入提示词，若项目两份文件内容大量重复会增 token，由同目录 AGENTS.md 优先声明约束冲突。
