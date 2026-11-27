---
id: TASK-0533
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0309]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 6cc2a7612
read_paths: []
write_paths:
  - apps/desktop/src/main/
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 主窗口导航拦截精细化：自身导航放行、外部链接转系统浏览器（上游 9741f73ae）

## 合同

- 来源与目标：PLAN-0032 基线外增量——手工合并上游 `9741f73ae`「主窗口拦截离开应用自身页面的导航」。本地 TASK-0309 已先于上游引入 `will-navigate` 兜底，但实现是全量拦截：任何顶层导航一律静默拦下，外部网页链接点击后无任何反应，且开发态 reload 等场景语义粗糙。上游的精细化语义——应用自身页面内导航放行、http/mailto 链接转交系统浏览器、其余拦下——既不削弱 TASK-0309 的安全边界（外部内容永远不能替换应用窗口），又修复外部链接点击无反应的体验缺陷。
- 做（本任务）：
  - 新增 `apps/desktop/src/main/main-window-navigation.ts`：`isAppSelfNavigation(targetUrl, currentUrl)`——file 协议下要求同源同路径（打包态 reload/换 hash 放行），http(s) 下要求同 origin（开发服务器内导航放行）；URL 解析失败一律视为非自身。
  - `main-window-navigation.test.ts`：移植上游 4 用例（打包页 reload、dev server 内导航、网页拒绝、其他本地文件拒绝）。
  - `apps/desktop/src/main/window-manager.ts`：`will-navigate` 改为先放行自身导航，非自身一律 preventDefault，http(s)/mailto 转交 `openExternalUrl`；更新 TASK-0309 注释说明两者关系。
  - release fragment 一份。
- 不做：`setWindowOpenHandler`（window.open 出口）维持现状不改动；window-manager 其余本地分叉（品牌图标、speech-input、ui-zoom 等）不动。
- Given / When / Then：
  - 渲染进程内 `<a href="https://…">` 顶层导航 → 应用窗口不被替换，链接在系统浏览器打开。
  - 应用自身页面内导航（打包态 file reload、dev server 内跳转）→ 正常放行。
  - `file:///…/notes.md` 等其他本地文件导航 → 拦下且不打开。
- 验证：桌面定向 vitest `main-window-navigation.test.ts`；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：无独立实机验收要求（单元测试覆盖判定逻辑；will-navigate 接线为声明式 Electron 事件）。

## 交付

- 状态：2026-11-27 完成实施与工程验证，转 verifying 待用户验收。
- 工程验证（全部实际执行）：
  - 桌面定向 vitest `main-window-navigation.test.ts` 4/4 通过；verifier 独立复跑同绿。
  - `bun run test:impact --` 改动源文件：41 个测试文件中 366 用例通过，仅 `media-protocol.test.ts` 远程取流用例超时失败——已核实为既有 loopback SSH 环境性失败（5000ms 超时，该测试不经 window-manager 导航路径，与本改动无因果）。
  - `bun run check` 见下；类型、lint、guards、check:quick 均通过；release-notes `--check` exit 0（仅既有风格警告）。
  - 独立 verifier 复查 verdict pass：判定函数与上游逐字节一致、安全边界未削弱（非自身导航全部 preventDefault，javascript:/data: 无绕过）、本地既有分叉未触动；采纳其建议将 deprecated 位置参数改为 `event.url` 与上游对齐。
- 未运行项：Desktop 实机走查（will-navigate 的 mailto 实际触发，与上游同样未经实机复现）；loopback SSH 相关失败圈为环境问题非本任务范围。
- 风险与说明：dev server 同 origin 页面被 302 到外部 origin 时无 will-redirect 复判（仅开发态可达，上游同一缺口）；URL 解析失败分支 fail-closed 无单测（上游同）。
