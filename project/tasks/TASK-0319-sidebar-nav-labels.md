---
id: TASK-0319
type: task
status: verifying
priority: P2
owner: desktop
requirement: REQ-0018
plan: null
source: REQ-0018
related_requirement: [REQ-0018]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: 929d02e2e
read_paths: [apps/desktop/src/shared/i18n, apps/desktop/src/renderer/domains/project/components/sidebar, packages/plugins/presets/vetta-ui-design/locales, .github/release-notes]
write_paths: [apps/desktop/src/shared/i18n/locales/zh, apps/desktop/src/shared/i18n/locales/en, packages/plugins/presets/vetta-ui-design/locales, apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.ts, apps/desktop/src/renderer/root-layout/useIdleRoutePrefetch.ts, .github/release-notes/v0.1.3.md, project/requirements/REQ-0018-desktop-sidebar-nav-labels.md, project/requirements/README.md, project/tasks/TASK-0319-sidebar-nav-labels.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 侧边栏入口改名：「能力」→「技能与连接器」，「设计」→「原型设计」

## 目标

按 [REQ-0018](../requirements/REQ-0018-desktop-sidebar-nav-labels.md) 把侧边栏两个信息量不足的入口改成能预测内容的名字，并同步所有以入口名称指代该导航项的相邻文案。

## 范围

### 并发评估

- 结论：不支持并发（同一批 i18n catalog 与两个注释文件由单 Agent 串行修改，无并行收益）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/src/shared/i18n/locales/{zh,en}/project.json`、`common.json`、`settings.json`；`packages/plugins/presets/vetta-ui-design/locales/{zh,en}.json`
- Branch：`main`（本地主工作区串行，未拆 worktree：改动小且无并行写者）
- Worktree：`.`
- 集成负责人：coordinator（按交付合同集成）
- 集成顺序：本 Task 单独集成

### 做

1. `project:sidebar.nav.skills`：中文「能力」→「技能与连接器」，英文 `Capabilities` → `Skills & Connectors`；
2. 设计画廊插件导航标签 `gallery.nav.label`（`packages/plugins/presets/vetta-ui-design/locales/{zh,en}.json`）：中文「设计」→「原型设计」，英文 `Design` → `Prototype Design`；
3. 同步以入口名指代导航项的相邻文案：`common:pageOpen.targets.skills`、`project:sidebar.tour.skills.title`、`settings:assistant.context.mcp`（中英文）；
4. 更新 `useSidebarModel.ts` / `useIdleRoutePrefetch.ts` 中按旧名描述默认置顶项的注释；
5. 当前版本发布说明 `.github/release-notes/v0.1.3.md` 补一条「改进」。

### 不做

- 不改能力页标题、搜索/添加按钮等页面内以「能力」泛指的文案（见 REQ 的「不做什么」）；
- 不改路由、导航布局持久化 key、插件 id、图标、默认置顶顺序与任何交互行为；
- 不运行 `verify:ui:*`（本任务未获 UI 验证授权）。

## Given / When / Then

- Given：用户打开 Desktop 侧边栏；
- When：查看置顶区与「全部」区；
- Then：原「能力」显示「技能与连接器」，原「设计」显示「原型设计」；英文为 `Skills & Connectors` / `Prototype Design`；
- Given：用户被新手引导、页面跳转确认或设置助手指向该入口；
- When：阅读提示文案；
- Then：入口名称与侧边栏一致，不出现旧名。

## 必须保持

- 入口 key（`/abilities`、`workspaceViewNavKey("vetta-ui-design","gallery")`）、路由与点击行为不变；
- 用户已持久化的自定义导航布局不受改名影响；
- 中英文 catalog 同步更新，缺译回退不暴露原始 key；
- 不改动与本次命名无关的「能力」「设计」泛指文案。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/project/components/sidebar`（侧边栏模型/布局）与 i18n 相关定向测试；
- 用户流程：侧边栏入口渲染新名称，点击仍进入同一路由（组件测试已覆盖 labelKey → 路由映射，本次只改 catalog 值）；
- 质量检查：`bun run check:quick`，必要时 `bun run check`；
- 说明：本次为 catalog 文案值变更，无逻辑分支变化；i18n key 由 tsc 类型增强保护。

## 验收分层

- 工程验证：通过；定向 22 文件 / 132 例全绿，`check:quick` 与完整 `check` 全绿（命令与结果见交付记录）。
- 技术评审：自审；未发现合同或兼容风险。
- 集成：`integration_status: pending`，本地 `main` 串行。
- 人工功能验收：待验收（侧边栏目验两个新名称，并确认点击行为不变）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 已启动，任一会话页可见侧边栏；
- 操作步骤：看置顶区「技能与连接器」「原型设计」；分别点击，确认进入能力页与设计画廊；
- 预期行为与最终产物：入口名称与页面内容相符，点击行为不变；
- 不通过表现与已知限制：能力页标题仍为「能力」（本 Task 有意不改页面内泛指文案）；
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：
  - `apps/desktop/src/shared/i18n/locales/{zh,en}/project.json`：导航 `sidebar.nav.skills` 与新手引导 `tour.sidebar.skills.title`；
  - `apps/desktop/src/shared/i18n/locales/{zh,en}/common.json`：页面跳转确认目标名 `navigationApproval.targets.skills`；
  - `apps/desktop/src/shared/i18n/locales/{zh,en}/settings.json`：设置助手路径提示 `aiAssist.context.mcp`；
  - `packages/plugins/presets/vetta-ui-design/locales/{zh,en}.json`：设计画廊导航标签 `gallery.nav.label`；
  - `useSidebarModel.ts` / `useIdleRoutePrefetch.ts`：按旧名描述默认置顶项的注释；后者补 `Modified by The Open Forge contributors.` 声明头（修改声明审计要求）；
  - 新增 `sidebar-nav-naming.test.ts`：断言同一入口在导航、新手引导、页面跳转确认与设置助手里同名（中英文各 1 例）；
  - `.github/release-notes/v0.1.3.md`：改进条目；
  - 记录：`REQ-0018`、`TASK-0319`、两份索引。
- 实际运行：
  - `cd apps/desktop && bun run test -- src/renderer/domains/project/components/sidebar src/renderer/shared/i18n`：22 文件 / 132 例全绿（含新增 2 例）；
  - `bun run check:quick`：通过（含修改声明审计 `ratchet new=0`）；
  - `bun run check`：lint、五路 typecheck、guards、mobile lint 全绿。
- 未运行及原因：`verify:ui:*` 需用户明确授权，未运行；未跑 `test:impact` / `test:changed`——本次只改 catalog 文案值与注释，已用侧边栏与 i18n 定向套件覆盖渲染路径，完整 check 覆盖类型与守卫；真实侧边栏观感留待人工验收。
- Worktree：未拆 worktree（`worktree: .`），改动在主工作区串行完成。
- 剩余风险：设计画廊插件标签由插件宿主加载，运行中的 dev 实例需重启 `bun dev` 才可见；能力页标题仍是「能力」（有意，见 REQ「不做什么」）。
