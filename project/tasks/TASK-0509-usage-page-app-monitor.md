---
id: TASK-0509
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0032
source: upstream e83df2e76 + 8eda12ea4 + e560e4016 + 36522aab9（参照重写，PLAN-0032 P6）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0505]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0509-usage-page-app-monitor
worktree: unassigned（待创建）
base_commit: be5f5f58e
read_paths:
  - apps/desktop/src/main/app-monitor/
  - apps/desktop/src/renderer/domains/settings/components/useUsageSeries.ts
  - apps/desktop/src/main/plugins/plugin-api-version.ts
  - apps/desktop/src/preload/
write_paths:
  - apps/desktop/src/main/app-monitor/
  - apps/desktop/src/preload/
  - apps/desktop/src/renderer/domains/settings/components/usage/
  - apps/desktop/src/shared/i18n/locales/en/
  - apps/desktop/src/shared/i18n/locales/zh/
  - apps/desktop/package.json
  - apps/desktop/src/renderer/domains/settings/registry.ts
  - apps/desktop/src/renderer/domains/settings/components/SettingsPage.tsx
  - apps/desktop/src/renderer/domains/settings/components/settings-tab-loaders.ts
  - apps/desktop/src/renderer/shared/store/ui-atoms.ts
  - scripts/quality/baselines/design-exceptions.json
  - apps/desktop/DESIGN.md
  - project/tasks/TASK-0509-usage-page-app-monitor.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/settings/components/usage/
depends_on: [TASK-0505]
conflicts_with: []
integration_status: integrated
created: 2026-11-25
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 本机用量页（app-monitor 数据层 + 设置/用量页面）（PLAN-0032 P6）

## 目标

按 D7 拍板结果，新增**本机 app-monitor 用量页**，与云端用量**并存**（云端用量保留在账户页不动）：

- 数据层（参照上游 `e83df2e76`）：app-monitor 按模型、按小时统计 token，按月落盘 `months/<YYYY-MM>.json`，IPC `getUsageReport`。
- 页面（参照上游 `8eda12ea4`）：`apps/desktop/src/renderer/domains/settings/components/usage/`。
- 小票（`e560e4016`）+ 连续使用与高峰时段（`36522aab9`）。
- 新增依赖 `chart.js ^4.5.0`，直接用 vanilla API + ref，不引入 React 绑定。

## 范围

### 并发评估

- 结论：条件支持
- 执行方式：parallel（独立 worktree `task/TASK-0509-usage-page-app-monitor`）
- 可并行 Task：TASK-0506、TASK-0507、TASK-0508
- 前置依赖：无（D7 已拍板）
- 冲突文件/独占路径：`main/usage/` + `settings/components/usage/` 独占；`plugin-api-version.ts`、`preload`、根 `package.json` 与 TASK-0510 共享 → **conflicts_with TASK-0510**，集成顺序由 Coordinator 排（建议先 0509 后 0510，或反之先确认）
- Branch：`task/TASK-0509-usage-page-app-monitor`
- Worktree：由 Coordinator 派工时 `bun run worktree:create --task TASK-0509`

### 做

- ~~`main/usage/`~~（实施落位调整：聚合代码直接放 `app-monitor/`，与上游同构，不另建 `main/usage/`）：聚合 app-monitor 事件，按 (model, hour) 统计 input/output/cached token；月文件读写；首次使用无文件时返回空数组，不报错。
- IPC `getUsageReport`（renderer → main），preload 暴露类型化 API。
- `settings/components/usage/`：页面接 `chart.js` 渲染按模型堆叠的面积图 / 按小时柱状图 / 连续使用天数 / 高峰时段。
- 小票视图：当前会话/当日的 token 用量小卡片。
- i18n：en/zh 用量页所有用户可见文案。
- 核查团队会话用量归属：如果团队会话走同一 app-monitor 管道，自然覆盖；否则在 `docs/` 说明并写入验收。
- Plugin API 版本：本期不新增插件能力，**不需要**升 2.14.0。

### 不做

- 不动云端 `useUsageSeries.ts` 与账户页用量卡片。
- 不引入 vetta-serv 上游路径。
- 不写远端上报；数据只存本机。

## Given / When / Then

- Given：用户使用 Desktop 一段时间（或测试期注入假数据）
- When：进入设置/用量页
- Then：看到按模型/小时的图表、连续使用天数、高峰时段；首次使用无数据时显示空态（不报错）；图表用 chart.js 渲染；云端账户页用量卡片保持不变

## 必须保持

- 云端 `useUsageSeries` 行为不变。
- 未登录用户也能看到本机用量（这是本任务的核心动机）。
- 持久化文件 `months/<YYYY-MM>.json` 旧版本缺失时读取不抛错。

## 测试与验证

- 定向测试：`main/usage/`、`settings/components/usage/` 测试
- 用户流程：注入假数据 → 打开用量页 → 切换 Tab 看图表/小票/连续天数
- 质量检查：`bun run test:impact`、`bun run check`
- 依赖审计：新增 `chart.js` 后跑 `bun install` 确认 lockfile 一致，无新增高危漏洞

## 验收分层

- 工程验证：已执行（2026-11-26）——`bun run check:types` 通过；定向 vitest 4 文件 31 用例全绿（`app-monitor-service.usage.test.ts`、`app-monitor-usage-report.test.ts`、`UsageSettings.test.tsx`、`usage-aggregation.test.ts`）；邻近回归 5 文件 31 用例全绿（`app-monitor-service.test.ts`、`app-monitor-data.test.ts`、`app-monitor-parser.test.ts`、`diagnostics-bundle.test.ts`、`desktop-conversation-service.test.ts`）；`check-guards` 全绿（设计例外已按移植原语口径登记，`DESIGN.md` 有对应说明）；`test:impact` 有 4 个预存在失败（`media-protocol`/`file-protocol`/`skill-presentation-read`，均为 SSH 远程项目相关，改动面之外，未随本任务恶化——改动文件与这些域无交集）。
- 技术评审：独立评审
- 集成：integrated（直接落 main，串行在 TASK-0510 之后，conflicts_with 已消解）
- 人工功能验收：待验收（用户实机查看用量页图表与小票）
- 发布：未授权

## 实施差异记录

- 数据层落位 `app-monitor/app-monitor-usage.ts` 与 `app-monitor/app-monitor-usage-report.ts`（上游 verbatim 移植 + notice 头），未新建 `main/usage/`；月归档经 `listPersistedAppMonitorMonths` 读取既有 `months/<YYYY-MM>.json`，跨月聚合在 service `getUsageReport()` 内完成。
- 团队会话用量归属：核查结论——与上游一致，团队会话不进入 `monitorRuntimeSession` 管道（上游同样未覆盖），仅普通会话、批量任务与调度任务计入；维持上游行为，未扩展。
- `SettingsTab` union 新增 `"usage"`；`settings.changed` 埋点的 `AppMonitorSettingsTab` 未加 usage（与上游一致）。
- i18n 品牌词写 "Vetta" 原文，由 `desktopBrand` postProcessor 归一；`usage` 键树 verbatim 移植 en/zh。
- `chart.js ^4.5.0` 已加入 desktop 依赖并完成 `bun install`（lockfile 已更新）。

## 功能验收包

- 入口：Desktop → 设置 → 用量
- 用例 1：首次进入（无 months 文件）显示空态，不报错
- 用例 2：注入若干 app-monitor 事件后再次进入，看到按模型堆叠图与连续天数
- 用例 3：云端账户页用量卡片依旧工作（对照）
- 用例 4：未登录状态下进入本机用量页，仍可见数据
