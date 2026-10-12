---
id: TASK-0225
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0086（内置浏览器指针穿透调用落在 WebContents 上，setIgnoreMouseEvents 每次必抛 TypeError）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0086]
execution: serial
branch:
worktree:
base_commit: 254796d87
read_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/ipc/browser-view.ts, apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts]
write_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts, apps/desktop/src/main/browser-automation/browser-view-host.test.ts, apps/desktop/src/main/ipc/browser-view.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0086-browser-view-passthrough-wrong-target.md, project/tasks/TASK-0225-browser-view-passthrough-target.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/browser-automation/browser-view-host.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器拖拽穿透：Electron 无 per-view ignore-mouse，穿透期改由隐藏 view 让位

## 目标

分栏拖拽 / tab 拖拽 / 浮动 overlay 拖动期间，`setInputPassthrough` 不再每次抛 `TypeError: setIgnoreMouseEvents is not a function`（0.1.3 日志 70 次）。指针事件按设计落到 DOM 兜底 overlay：穿透开启时暂时 `setVisible(false)` 隐去原生 view（页面保活），结束时按请求可见性恢复——Electron 39 的 `setIgnoreMouseEvents` 只存在于 `BaseWindow`/`BrowserWindow`，`WebContentsView`/`View`/`WebContents` 上都没有（electron#23863 仍 open），窗口级 ignore+forward 会把点击泄漏给下层应用，不采用。

## 范围

### 并发评估

- 结论：支持（单文件改动面小，main 工作区串行）。
- 执行方式：serial
- 冲突文件/独占路径：`browser-view-host.ts` 独占；release-notes 与 tasks/README 为全任务共写区，按序串行合并。
- 集成顺序：定向测试 + impact + check:quick 通过后随批集成

### 做

- `browser-view-host.ts`：`ViewRecord` 增加 `passthrough` 位；新增统一 `applyVisible(record)`（实际可见 = `record.visible && !record.passthrough`），`attach`/`setVisible`/`setInputPassthrough` 都走它；`BrowserViewContents` 删除 `setIgnoreMouseEvents`（真实 API 面不存在，测试 fake 照抄才一直没拦住）；注释注明 Electron 缺口与选 hidden 让位的理由。
- `browser-view-host.test.ts`：fake 同步移除该方法；原断言 `ignores` 的用例改写为「穿透期 view 隐藏、请求可见性不丢、结束后恢复」，先红后绿。
- `ipc/browser-view.test.ts`：fake contents 同步删除 `setIgnoreMouseEvents`/`ignores`。
- 发布说明：`v0.1.3.md`「修复」一条（拖拽面板不再刷错且 overlay 拖拽可用）。

### 不做

- 不引入窗口级 `setIgnoreMouseEvents(ignore, {forward:true})`：全窗穿透会把真实点击泄漏给下层应用窗口。
- 不改 IPC channel、`DesktopBrowserViewPassthroughRequest` 形状或 renderer 调用点。
- 不处理 `canGoBack/canGoForward` deprecation（日志归类噪音，另记）。

## Given / When / Then

- Given 已 attach 的 view 请求可见性为 true；When `setInputPassthrough(id, true)`；Then view 实际 `setVisible(false)`，无任何抛错。
- Given 穿透中收到 `update({visible:false})`；When 穿透结束 `passthrough:false`；Then view 仍不可见（请求态被保留，不是无条件 setVisible(true)）。
- Given 旧实现；When 上述任一路径；Then `webContents.setIgnoreMouseEvents` TypeError 刷屏——回归用例在旧代码下必红。

## 必须保持

- `attach`/`detach`/`setBounds`/`navigate`/`control` 语义不变；detach 仍保持 contents 存活。
- 页面在穿透期间不被销毁，仅隐去绘制；`visible` 请求态与穿透位互相独立。
- IPC 层仍是薄桥：策略留在 browser-view-host。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/browser-automation/browser-view-host.test.ts apps/desktop/src/main/ipc/browser-view.test.ts`。
- 用户流程：打开内置浏览器面板 → 拖分栏/tab/浮动 overlay → 无 TypeError 刷屏、overlay 拖拽可跟踪（页面在拖拽期间隐去属已知取舍）。
- 质量检查：`bun run test:impact -- apps/desktop/src/main/browser-automation/browser-view-host.ts` + `bun run check:quick`。

## 验收分层

- 工程验证：通过（红基线 → 定向 20 例绿 + impact 182 例 + types/lint 全绿）。
- 技术评审：自审。
- 集成：待集成。
- 人工功能验收：待验收（拖拽期间页面隐去为预期取舍；真实机器上确认 overlay 拖拽不断流）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 内置浏览器 tab 打开任意页面。
- 操作步骤：拖动面板分栏把手 / 拖 tab / 拖浮动 overlay；观察主进程日志与拖拽反馈。
- 预期行为：不再出现 `vetta:browser-view:passthrough TypeError`；拖拽过程 overlay 正常跟踪，结束后页面恢复可见。
- 不通过表现：错误继续刷屏，或穿透结束后页面永久消失（请求可见性被吞）。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：`browser-view-host.ts` 新增 `ViewRecord.passthrough` 与 `applyVisible`（实际可见 = `visible && !passthrough`），`attach`/`setVisible`/`setInputPassthrough` 统一走它；`BrowserViewContents` 删除伪 `setIgnoreMouseEvents`（Electron 39 无 per-view API，见注释）；`browser-view-host.test.ts` 三例新断言（穿透隐去+恢复、穿透中改不可见不误显、初始不可见保持）；`ipc/browser-view.test.ts` fake 同步移除伪方法。
- 实际运行：
  - 红基线：`browser-view-host.test.ts` 3 例失败，报 `TypeError: contents.setIgnoreMouseEvents is not a function`（与生产日志同签名）。
  - 定向：`run-vitest browser-view-host.test.ts ipc/browser-view.test.ts team-session-delete.test.ts` → 20 例过（`browser-view.test.ts` 套件因 `window-manager.ts:25` `process.resourcesPath` 在 Node 下 undefined 挂 import——已提交既有问题，非本改动）。
  - impact：`bun run test:impact -- <3 个改动文件>` → desktop 侧 182 例过，4 套件同为上述既有红；runtime-core 339 例过。
  - `bun run check:types` 全绿；`bun run check:lint` 全绿（biome format 已修复）。
- 未运行及原因：`bun run check:quick`/`bun run check` 被 `.ua/` 未跟踪临时脚本的 `check:guards` 既有失败阻断（与本改动无关，已上报）；UI 实机验证未授权未跑。
- Worktree：未拆出（serial，main 工作区串行集成，与 TASK-0221/0222 同例）
- 剩余风险：拖拽期间页面整体隐去属设计取舍；真实机器 overlay 拖拽手感待人工验收。
