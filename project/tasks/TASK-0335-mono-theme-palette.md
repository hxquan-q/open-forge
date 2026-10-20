---
id: TASK-0335
type: task
status: verifying
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0014
source: user-request; RESEARCH-0025; upstream 313be5324
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0336, TASK-0337, TASK-0338]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 218f07776
read_paths:
  - packages/theme-ui/src
  - apps/desktop/src/renderer/shared/theme
  - project/tasks
  - .github/release-notes
write_paths:
  - apps/desktop/src/renderer/shared/theme/themes/mono.ts
  - apps/desktop/src/renderer/shared/theme/themes/mono.test.ts
  - project/tasks/TASK-0335-mono-theme-palette.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/shared/theme/themes/mono.ts
  - apps/desktop/src/renderer/shared/theme/themes/mono.test.ts
depends_on: []
conflicts_with: [TASK-0336, TASK-0337, TASK-0338]
integration_status: integrated
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# mono 主题深浅色配色与 token 覆盖回归

## 目标

按上游 `313be5324`（style(theme): 调整默认 mono 主题深浅色背景与边框配色）同步 mono 主题配色：深色背景改为 `#0f0f0f` 并补 `secondary`，浅色背景改为 `#faf9f9`、`secondary` 改为 `#f1f0f0`、边框/输入框改为 `rgb(228, 228, 228)`。同时补 `mono.test.ts`，锁定配色值与 `TOKEN_CSS_VAR` 全键覆盖，防止后续新增 token 时 mono 漏配。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0336/0337/0338 共享 Tasks 索引与 Release Notes。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`mono.ts`、`mono.test.ts` 为本 Task 独占；索引与发布说明共享。
- Branch：`main`。
- Worktree：不拆出；改动仅两个文件，主工作区串行更快且避免索引漂移。
- 集成负责人：当前 Coordinator。
- 集成顺序：本 Task 为四项 UI 同步的第一片，先落 mono，再依次 0336 → 0337 → 0338。

### 做

1. 修改 `apps/desktop/src/renderer/shared/theme/themes/mono.ts`：只对齐上游配色差异，保持既有 token 键与主题结构。
2. 新增 `mono.test.ts`：断言深/浅色关键色值；遍历 `TOKEN_CSS_VAR`，断言每个键在 dark/light 均有定义。
3. 更新 Tasks 索引、本 Task 交付记录与当前版本发布说明。

### 不做

- 不改其他主题、品牌 JSON、主题注入接缝或 `TOKEN_CSS_VAR` 合同。
- 不整文件覆盖上游 `mono.ts`，不引入上游后续颜色改动。
- 不启动 Desktop、不运行 `verify:ui:*`、不读取真实用户状态。

## Given / When / Then

- Given 用户选择 mono 主题，When 应用深色模式，Then 背景为 `#0f0f0f` 且 `secondary` 为 `#171717`，其余 token 仍可解析。
- Given 用户选择 mono 主题，When 应用浅色模式，Then 背景为 `#faf9f9`、`secondary` 为 `#f1f0f0`、`border`/`input` 为 `rgb(228, 228, 228)`。
- Given `TOKEN_CSS_VAR` 新增一个键，When 运行 mono 测试，Then 测试指出缺失的深/浅色定义而不是静默回退。

## 必须保持

- `TOKEN_CSS_VAR` 的键集合与消费方不变；mono 仍实现完整的主题 token 合同。
- 其他主题与品牌层文件零改动。
- 不改变主题持久化、切换与 CSS 变量注入路径。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/shared/theme/themes/mono.test.ts`。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：无需 UI 实机；色值与 token 覆盖由组件级测试证明。

## 验收分层

- 工程验证：已完成；`mono.test.ts` 2 个用例覆盖关键色值与 `TOKEN_CSS_VAR` 全键；`bun run check:quick` 通过。
- 技术评审：自审；配色值逐项对照上游 `313be5324`，未整文件覆盖。
- 集成：实现提交 `b0c2148f0` 已集成 main；记录 `2fcc7d9e7` 已推送 `origin/dev`，`git ls-remote` 核对远端为 `2fcc7d9e7583e24de3c3c961f42357556fb0c57f`。
- 人工功能验收：待验收；用户可在 Desktop 切换 mono 深浅色查看。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop → 设置 → 外观 → 主题 mono。
- 操作步骤或 AI 任务输入：分别切换深色/浅色。
- 预期行为与最终产物：背景、次级面板与边框呈现新配色，文本与控件对比度正常。
- 不通过表现与已知限制：仍显示旧色值或 token 缺失导致透明/回退。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `mono.ts`：深色 `background` 改为 `#0f0f0f`、`secondary` 补 `#171717`；浅色 `background` 改为 `#faf9f9`、`secondary` 改为 `#f1f0f0`、`border`/`input` 改为 `rgb(228, 228, 228)`。
  - `mono.test.ts`（新增）：锁定上述关键色值，并遍历 `TOKEN_CSS_VAR` 断言 dark/light 全键有定义。
  - 更新本 Task 记录、Tasks 索引与 0.1.3 发布说明。
- 实际运行：`cd apps/desktop && bun run test src/renderer/shared/theme/themes/mono.test.ts` → 1 file / 2 tests passed；`bun run check:quick` 通过；`bun run test:impact` 通过——Desktop 977 files / 5293 tests、theme-ui 定向 3 + 5 tests。
- 未运行及原因：Desktop 实机主题切换未运行（本 Task 未授权启动真实用户环境）。
- 质量检查：完整 `bun run check` 通过（exit 0；含 lint 4962 files、根 `tsgo`、Desktop `typecheck:incremental`、guards，ratchet `new=0`）。
- Worktree：未拆出；单文件族串行修改。
- 剩余风险：对比度与观感需人工切换 mono 深浅色确认；测试只锁色值与 token 覆盖，不覆盖浏览器计算样式。
