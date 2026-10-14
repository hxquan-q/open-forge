---
id: TASK-0252
type: task
status: ready
priority: P1
owner: Desktop i18n / 品牌层
requirement: REQ-0013
plan:
source: REQ-0013；证据见本文件「当前事实」
related_requirement: [REQ-0013, REQ-0011]
related_plan: []
related_tasks: [TASK-0249, TASK-0250, TASK-0251]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 2d17d66af
read_paths: [apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/desktop-brand.distribution.json, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/shared/i18n/locales/zh, apps/desktop/src/shared/i18n/locales/en]
write_paths: [apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.json, apps/desktop/src/shared/desktop-brand.distribution.json, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/src/shared/i18n/locales/zh, apps/desktop/src/shared/i18n/locales/en, project/tasks/TASK-0252-desktop-i18n-brand-composition-guard.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# Desktop i18n 组合词归一与防回退门禁

## 目标

消掉品牌 post-processor 只替换单词造成的「小爱ai Desktop」这类别扭组合，并用门禁防止遗留品牌名重新进入用户可见文案。

## 当前事实（证据）

- `apps/desktop/src/shared/desktop-brand.ts:51-70` 只按 `legacyProductNames`（`Open Vetta`、`Vetta`）逐词替换，长词优先未处理：`Vetta Desktop` 变成「小爱ai Desktop」。
- 受影响文本例如 `src/shared/i18n/locales/{zh,en}/settings.json` 的 `agentInstruction`（「请通过 Vetta Desktop 的应用能力…」）与 `whTestText`（`Vetta Desktop App`）；locale 里 `\bVetta\b` 出现约 150 处。
- 现有品牌合同测试只覆盖少量指定文件与 HTML 标题，未覆盖「任一 locale × 任一档位的渲染结果不含遗留品牌名」。

## 范围

### 并发评估

- 结论：不支持并发（改品牌归一规则会同时影响 0249 的身份词来源与既有品牌测试）
- 执行方式：serial
- 可并行 Task：无（须在 TASK-0249 之后执行）
- 前置依赖：TASK-0249（避免两处同时改品牌解析语义）
- 冲突文件/独占路径：`apps/desktop/src/shared/desktop-brand*`、`apps/desktop/src/shared/i18n/locales/**`
- Branch：main（沿用当前主检出）
- Worktree：不拆出（main 串行）
- 集成负责人：本轮 Agent
- 集成顺序：最后执行

### 做

- 归一规则支持更长匹配（`Vetta Desktop` 先于 `Vetta`），必要时覆盖 `Open Vetta Desktop` 等组合；保持兼容名与路径不被替换。
- 复核 `Vetta CLI`、`Vetta Computer Use`、`Vetta Go`、`Vetta Vivi` 等组合词在渲染后的结果是否符合预期品牌名。
- 新增门禁：对每个 locale × 每个档位渲染全部命名空间，断言结果不含 `\bVetta\b`；同步更新既有品牌合同测试的期望值。

### 不做

- 不改品牌资产、图标与打包身份。
- 不改 i18n key 名与语义。
- 不改冻结兼容标识与数据目录。

## Given / When / Then

- Given 默认档中文界面，When 渲染含 `Vetta Desktop` 的文案，Then 输出使用小爱ai 且不带多余的 `Desktop` 残留。
- Given 任一档位与语言，When 渲染全部命名空间，Then 结果不含遗留品牌名。
- Given 兼容文本（`~/.vetta`、`vetta:`、`VETTA_*`、`.vettapkg`），When 经过归一，Then 原样保留。

## 必须保持

- 兼容名与路径不被替换的既有合同。
- 两档共用冻结身份、切换档位零迁移。
- 静态 HTML 标题与运行时标题的分工不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/shared/desktop-brand.test.ts`
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter `integration_status` 一致
- 人工功能验收：待验收
- 发布：未授权

## 功能验收包

- 入口与前置条件：dev 启动 Desktop，打开设置页与相关对话入口。
- 操作步骤或 AI 任务输入：浏览出现产品名的页面（设置、连接器、帮助文案）。
- 预期行为与最终产物：全部显示当前品牌名，无「小爱ai Desktop」这类组合。
- 不通过表现与已知限制：仍出现遗留品牌名或别扭组合。
- 验收反馈及回归案例：待回填

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：不拆出（main 串行）
- 剩余风险：
