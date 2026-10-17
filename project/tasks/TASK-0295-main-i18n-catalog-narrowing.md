---
id: TASK-0295
type: task
status: done
priority: P2
owner: apps/desktop
requirement:
plan:
source: ISSUE-0021
related_requirement: []
related_plan: [PLAN-0010]
related_tasks: []
related_issues: [ISSUE-0021]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 28d3b533b
read_paths:
  - apps/desktop/src/shared/i18n/
  - apps/desktop/src/main/i18n/
  - docs/adr/0031-desktop-i18n-i18next-semantic-keys-main-owned-language.md
write_paths:
  - apps/desktop/src/shared/i18n/main-resources.ts
  - apps/desktop/src/main/i18n/index.ts
  - docs/adr/0031-desktop-i18n-i18next-semantic-keys-main-owned-language.md
exclusive_paths:
  - apps/desktop/src/shared/i18n/main-resources.ts
  - apps/desktop/src/main/i18n/index.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 主进程 i18n catalog 收窄（ISSUE-0021 B 方案第一片）

## 目标

ISSUE-0021 第二轮审计证实 ADR-0031「2-3 语言下体积可忽略」前提不成立（minified locale 505.4 kB，启动路径 ≈11.5%）。第一片做零渲染端语义风险的**主进程收窄**：`main/i18n/index.ts` 顶层 import 全量 `resources`（24 个 JSON 全部打进 main bundle），而 main 的实际 ns 使用面只有 **{main, common, settings, skills, pet}**（默认 ns + 4 个前缀调用：`skills:`/`pet:`/`common:manageApproval`/`settings:whTest*`，正则全量枚举核实）。

新增 `shared/i18n/main-resources.ts` 只静态导入这 5 个 ns × 两语言；main 的 i18n 改从它 + `config.js` 直接取（不再 import `resources.ts`——import 该模块即拉入全部 JSON）。主进程 bundle 丢弃 7 个 ns ≈ **206.0 kB**（abilities/agent-teams/automation/batch-tasks/chat/message/project）。renderer 路径零改动（全量静态、不闪保证不变）。

## 范围

### 并发评估

- 结论：不支持并行；serial，main 串行；main 进程单点导入，切片小。

### 做

- `main-resources.ts`（5 ns × 2 langs 静态导入 + `MAIN_NAMESPACES`）；`main/i18n/index.ts` 换源；ADR-0031 catalog 装载决策补记（前提证伪 + 收窄记录 + renderer B-1 待做）。
- 回归：mainT 全部 5 个 ns 前缀可取值（新增单测），既有 main i18n/托盘/通知套件全绿。

### 不做

- 不动 renderer 的静态打包与 `resources.ts`（B-1 独立切片：按 ns 懒加载 + 文案闪烁回归）。
- 不拆 settings ns 的 catalog（main 因 `settings:whTest*` 2 个 key 背 ~212 kB——留 B-1 一并评估 key 迁移）。
- 不改 `NAMESPACES` 注册表与 i18next.d.ts 类型链路。

## Given / When / Then

- Given：mainT 以 5 个 ns 中任一前缀取值，When：initAppLanguage 后调用，Then：返回译文（与收窄前一致）。
- Given：renderer 任一 i18n 用例，When：运行，Then：不受影响（resources.ts 未动）。

## 必须保持

- mainT 同步初始化语义（`initAsync:false`、init 返回即可用）。
- 「绝不暴露原始 key」：收窄后 main 若出现第 6 个 ns 前缀调用会露 key——单测锁定当前 ns 面，新增 ns 时须同步 `main-resources.ts`。
- 语言 SoT/切换流（ADR-0031）不变。

## 测试与验证

- 定向：main i18n 单测（新增）+ 既有 i18n/托盘/通知套件（apps/desktop cwd）；完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（ns 面正则枚举 + 单测锁定）；集成：pending；人工验收：不适用（无可见行为变化，构建产物差异由审计口径复核）；发布：未授权。

## 功能验收包

- 主进程 bundle 不再包含 renderer 专属 ns 的 locale 数据；无任何用户可见变化。

## 交付记录

- 实际修改：新增 `shared/i18n/main-resources.ts`（5 ns × 2 langs + `MAIN_NAMESPACES`）与 `main/i18n/index.test.ts`（ns 面锁定 2 例）；`main/i18n/index.ts` 改从 `config.js` + `main-resources.ts` 取值（不再 import `resources.ts`）；ADR-0031 catalog 装载决策补 2026-10-17 修订记。
- 实际运行：新单测 2/2（五个 ns 前缀样本全部返回译文且不露 key、双语 5 ns 目录非空）；完整 `bun run check` exit 0（单轮通过）。
- 未运行及原因：main bundle 实际体积差需 `build:main` 产物对照（本轮未打包 main——审计口径的 206 kB 为逐 ns minified 求和，与 renderer 审计同法互证）；真实启动耗时对照随 ISSUE-0021 后续切片一并复测。
- Worktree：未拆出（serial 单点切片）。
- 剩余风险：main 未来新增第 6 个 ns 前缀调用会露原始 key——由单测样本锁定 + main-resources.ts 头注释双保险提示。
