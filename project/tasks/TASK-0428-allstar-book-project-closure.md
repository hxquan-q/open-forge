---
id: TASK-0428
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: BUG-0167（TASK-0425 报告 F08）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0425, TASK-0423]
related_issues: []
related_bugs: [BUG-0167]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: 1881bd042
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/shared/i18n/locales
  - project/bugs/BUG-0167-allstar-book-project-closure.md
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.ts
  - apps/desktop/src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - project/tasks/TASK-0428-allstar-book-project-closure.md
  - project/tasks/README.md
  - project/bugs/BUG-0167-allstar-book-project-closure.md
  - project/bugs/README.md
  - project/plans/PLAN-0028-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0154-allstar-book-closure.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.ts
depends_on: []
conflicts_with: [TASK-0423]
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 开发册项目闭环：候选与补拉以版块册为事实源（BUG-0167）

## 目标

只登记在开发册的项目与普通项目一样可用：冷启动补拉会话历史、卡片计数正确、可从选择器新建开发会话。版块册（allstarProjects）成为创建候选与历史补拉的事实源，不再借普通项目清单兜底；未归册项目的 coding 会话保持「可达聚合」（卡片出现于已加载会话池）。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0423（M1 版块壳）同域但当前无在途改动，主检出串行，conflicts_with 已登记。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无。
- 冲突文件/独占路径：`useAllstarDevHomePageModel.ts` 独占；i18n project.json 与其他切片可能相邻，逐行暂存。
- Branch：主检出 chenxvhua。
- Worktree：不拆。
- 集成负责人：当前 Coordinator。
- 集成顺序：PLAN-0028 第 3 片。

### 做

1. `projectOptions` 改由 allstarProjects 派生（册内 name 优先，缺省回落目录名）；`selectedCwd` 兜底逻辑不变（册内默认项目优先，否则首个册条目，空册为 ""）。
2. 补拉 effect 随 projectOptions 自然改为册驱动；普通清单不再触发版块页补拉。
3. 空态文案拆分：页空态（无卡片=册空且无已加载 coding 会话）引导「打开已有项目」登记；已登记空卡片用新增 `empty.cardHint`。zh/en 同步。
4. 测试：册项目进候选/被补拉/可选中；普通-only 项目不再进候选；未归册已加载 coding 会话仍出卡片；空册时 selectedCwd 为空。

### 不做

- 不做完整会话管理/项目空间（TASK-0423 M1 范围）；
- 不改卡片分组派生逻辑与「还有 N 条」展示；
- 不改 openAllstar 登记链路本身。

## Given / When / Then

- Given 册含 `/code-only`（普通清单不含），When 冷启动进版块首页，Then `loadSessions('/code-only')` 被调用、`model.projects` 含该 cwd、`selectedCwd` 可选中它。
- Given 普通-only 项目 `/ordinary`，When 进版块首页，Then 它不出现在 `model.projects`、不因版块页触发补拉。
- Given 未归册项目已有 coding 会话在 sessionsMap，When 渲染卡片，Then 卡片仍出现（聚合路径）。
- Given 册为空，When 渲染，Then `selectedCwd === ''`、页空态引导登记。

## 必须保持

- 卡片派生（registered 空卡片、组内倒序截 5、按最近活跃排序、仅 coding）不变；
- 新建会话链路（写 coding 档 → /new-session）与打开会话委托不变；
- openAllstar/onOpenExistingProject 登记链路不变；
- loading 语义（projectsInitialized）不变。

## 测试与验证

- 定向：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx`（apps/desktop 目录内）。
- 相邻：AllstarDevHomePageView.test.tsx 与路由/入口相关 allstar 测试。
- `bun run check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待用户实机走查（登记目录→冷启动→卡片计数→新建会话）。
- 发布：未授权。

## 功能验收包

- 入口：侧栏「Allstar自主开发」→ 版块首页。
- 步骤：打开已有项目选一个含 coding 会话的目录 → 重启应用 → 进版块首页。
- 预期：卡片显示该目录会话计数；选择器含该目录；新建开发会话可用。
- 不通过表现：卡片 0 会话、选择器缺该目录。

## 交付记录

- 实际修改：`useAllstarDevHomePageModel.ts`（候选/补拉事实源改版块册、移除 projectsAtom 依赖、注释与接口文档同步、labels 增 `emptyCardHint`）；`useAllstarDevHomePageModel.test.tsx`（册快照逐用例隔离、3 个新语义用例改写、旧兜底断言更新）；`AllstarDevHomePageView.tsx`（空卡片用 `emptyCardHint`）；zh/en `project.json`（`empty.hint` 改登记引导、新增 `empty.cardHint`）；BUG-0167/本 Task/索引与 v0.1.4 fragment。
- 实际运行：hook 测试红 3→绿（7/7），View 3/3；相邻面 sidebar workspace-view / nav-route-prefetch / agent-mode-entry-points 22 例、weknora-nav 4 例全绿；`check:quick` 通过。
- 未运行及原因：完整 `bun run check` 与 `test:impact` 留批次收尾统一执行（影响面已由相邻定向覆盖）；实机冷启动走查待用户人工验收。
- Worktree：未拆出（主检出串行）。
- 剩余风险：普通-only 项目不再进版块候选是有意取舍（ADR-0151 决策 7 方向），发布说明已写明；未归册 coding 会话依赖会话池已加载才聚合，冷启动不保证（ADR 允许的可达路径）。
