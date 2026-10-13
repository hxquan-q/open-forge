---
id: TASK-0234
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: BUG-0099（内置浏览器仍调 Electron 已废弃的 canGoBack/canGoForward/goBack/goForward）
related_requirement: []
related_plan: []
related_tasks: [TASK-0229]
related_issues: []
related_bugs: [BUG-0099]
execution: serial
branch:
worktree:
base_commit: ba5f5bbc2
read_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/browser-automation/browser-view-host.test.ts, apps/desktop/src/main/ipc/browser-view.test.ts, project/bugs/BUG-0099-webcontents-deprecated-navigation-apis.md]
write_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/browser-automation/browser-view-host.test.ts, apps/desktop/src/main/ipc/browser-view.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0099-webcontents-deprecated-navigation-apis.md, project/tasks/TASK-0234-webcontents-navigation-history.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器导航 API 迁移到 `navigationHistory`

## 目标

`BrowserViewContents` 契约对齐 Electron 39 新形态：删 `goBack/goForward/canGoBack/canGoForward` 四个顶层方法，增 `navigationHistory` 子对象（同四方法）。

1. **接口**：`readonly navigationHistory: { goBack(): void; goForward(): void; canGoBack(): boolean; canGoForward(): boolean }`——真实 `WebContents.navigationHistory` 结构化满足。
2. **调用点**：`control` 的 back/forward 两分支与 `stateOf` 的 `canBack/canForward` 改走 `contents.navigationHistory.*`。
3. **fake**：两处测试实现同形态改造（host fake 保留计数与 back/forward 字段）。

## 约束

- 行为零变化——纯 API 迁移，`canBack/canForward` 输出语义、前进/后退手势完全不变；绿基线验证，不需要红测。
- 不引入对 `navigationHistory` 更多能力的扩展（getAllEntries/restore 等）——只迁现有四个消费点。

## 验收（Given/When/Then）

- Given：`control("back")` 且 `navigationHistory.canGoBack()` 为 true → Then：`goBack` 经 navigationHistory 调用，手势行为不变。
- Given：`stateOf` → Then：`canBack/canForward` 取 `navigationHistory` 同值。
- 类型与既有 host/ipc 测试套件全绿。

## 交付记录

- 绿基线验证（纯 API 迁移，按 Task 验收不需要红测）。
- 实际修改：`browser-view-host.ts`——`BrowserViewContents` 收敛 4 个直属导航方法为 `readonly navigationHistory` 子对象；`control` back/forward 与 `stateOf` `canBack/canForward` 改走该对象。真实 `WebContentsView` cast 路径结构契合（Electron 39 原生 `navigationHistory`）。
- 测试：host fake 改 navigationHistory 形态（back/forward 标志与 goBacks/goForwards 计数移入子对象）；control 用例扩展为 back+forward 双侧与「不可行时不调用」断言；ipc fake 同步。host 套件 18 例绿。
- 全量：impact（desktop 相关套件）264 例过；4 套件 `window-manager.ts:25` 既有 import 失败（与本改动无关）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 未运行：`bun run check` 全量（`.ua/` 既有 guard 残留会红）。
