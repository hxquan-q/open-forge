---
id: TASK-0271
type: task
status: ready
priority: P1
owner: skill-presets
requirement:
plan:
source: BUG-0114
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0114]
execution: parallel
branch: task/TASK-0271-report-canvas-canvas-enum
worktree: ../open-forge-wt/task-0271-report-canvas-canvas-enum
base_commit:
read_paths: [packages/skill-presets, apps/desktop/src/main/abilities/open-marketplace]
write_paths: [packages/skill-presets/report-canvas/ability.json, apps/desktop/src/main/abilities/open-marketplace/marketplace-preset-descriptors.test.ts, project/tasks/TASK-0271-report-canvas-canvas-enum.md]
exclusive_paths: [packages/skill-presets/report-canvas/ability.json, apps/desktop/src/main/abilities/open-marketplace/marketplace-preset-descriptors.test.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# report-canvas 展示描述改用 Schema 支持的 canvas 枚举

## 目标

让内置 `report-canvas` 的能力展示描述符合现行 showcaseSchema，恢复其详情展示，并加一条覆盖全部内置预设描述的合同测试，避免同类字段错误只能靠运行时告警暴露。

## 范围

### 并发评估

- 结论：支持
- 执行方式：parallel
- 可并行 Task：TASK-0272 / TASK-0273 / TASK-0274
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；与其它三个 Task 无文件交集
- Branch：`task/TASK-0271-report-canvas-canvas-enum`
- Worktree：`../open-forge-wt/task-0271-report-canvas-canvas-enum`
- 集成负责人：Coordinator
- 集成顺序：任意（文件不相交），建议最先并入

### 做

- 把 `packages/skill-presets/report-canvas/ability.json` 默认档与 `i18n.en` 档的 `"canvas": "markdown"` 改为 Schema 支持的取值。
- 取值决策：用 `docs`。依据：`canvas` 在 `apps/desktop/src/renderer/domains/abilities/components/detail/templates/showcase-canvas.tsx:335-358` 只决定装饰性画布母题，Schema 枚举（`apps/desktop/src/main/abilities/open-marketplace/marketplace-schema.ts:23`）为 design/code/docs/generic/browser/terminal/board；同为文档型展示的内置预设 `chart-canvas`、`publish-ability` 均用 `docs`，`report-canvas` 是文档型报告画布，与其同族。
- 新增合同测试 `marketplace-preset-descriptors.test.ts`：遍历 `packages/skill-presets/*/ability.json`，对每个 `detail.blocks[]` 用真实 `marketplaceDetailBlockSchema` 执行 `safeParse`，失败即列出文件与 Zod 问题 path。
- 测试用例须断言 report-canvas 的默认档与 en 档均能解析（旧字段必然失败），并覆盖「全部内置预设都能解析」这条更强的断言。

### 不做

- 不扩展 Schema 枚举（不接受把 `markdown` 加进合法值）。
- 不改展示渲染模板或画布母题实现。
- 不改其它预设的取值。
- 不把该测试搬进 `packages/skill-presets`：包不能反向 import `apps/*`（Invariant），Schema 事实源在消费方。

## Given / When / Then

- Given：内置 report-canvas 已安装，描述文件按本 Task 修改后随包发布。
- When：用户打开能力页面，宿主构建本地能力展示索引。
- Then：report-canvas 展示存在且默认档/英文档都能解析，不再产生 showcase.canvas 的 ZodError 告警。

## 必须保持

- `presentation` 解析失败仍走既有降级路径（捕获后忽略展示），不得让描述错误升级为技能列表整体失败。
- 其它内置预设的现有展示行为不变。
- `ability.json` 的 `schemaVersion`、`slug`、`version` 与结构不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/abilities/open-marketplace/marketplace-preset-descriptors.test.ts`（先建立失败基线：旧描述必红）。
- 用户流程：能力页展示 report-canvas 详情（本轮不做 UI 自动化，改由合同测试覆盖；人工目验步骤写入功能验收包）。
- 质量检查：改动落地后 `bun run test:impact -- packages/skill-presets/report-canvas/ability.json apps/desktop/src/main/abilities/open-marketplace/marketplace-preset-descriptors.test.ts`；本 Task 不单独跑完整 `check`（由集成后统一跑）。

## 验收分层

- 工程验证：待执行
- 技术评审：待执行
- 集成：pending
- 人工功能验收：待验收（能力页 report-canvas 详情展示）
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 开发实例，能力页，内置 report-canvas 可见。
- 操作步骤或 AI 任务输入：打开能力页 → 进入 report-canvas 详情。
- 预期行为与最终产物：详情页展示头图/展示区块正常渲染，`dev/main/*.log` 无 `showcase.canvas` 的 ZodError。
- 不通过表现与已知限制：详情空白或展示降级、日志继续出现枚举错误。
- 验收反馈及回归案例：待填写。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：创建/初始化/检查/清理结果
- 剩余风险：
