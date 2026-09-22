---
id: TASK-0013
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: 内存/GPU 占用优化专项调查（2026-09-23）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main]
write_paths: [apps/desktop/src/main, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---

# QuickPanel 预创建窗口改为按需创建

## 目标

`main.ts` 首帧后无条件 `createQuickPanelWindow()`，常驻一个隐藏透明窗 + renderer 进程（数十 MB）。窗口唯一唤出入口是热键，且 `showQuickPanelWindow` 已有惰性创建回退。改为首次触发时创建、创建后常驻复用（保留 show/hide 语义）。

## 方案边界（经对抗审查确认 + 修正）

- 删除 main.ts 预创建调用与 import；**保留** `syncQuickPanelTrigger()`（热键武装，与窗口零耦合）；
- 首次 show：热键按下即开始创建+loadURL，`ready-to-show` 后 reveal（position+show+focus+ON_SHOWN+玻璃模式）；挂起期间再次触发 → 立即走常驻路径并清标志防双 show；
- `did-fail-load` 兜底过滤 `isMainFrame`；`loadURL` promise 拒绝路径同样清标志；
- mac 首唤顺序：revealNow 先 `applyQuickPanelGlass`（幂等门）再发玻璃模式，消除 ready-to-show 先于 did-finish-load 时「实心→玻璃」闪变；
- `createQuickPanelWindow` 收回模块私有（全仓唯一外部引用是 main.ts 预创建点）。

## Given / When / Then

- Given 应用启动、快捷面板热键未触发
  When 用户正常使用主窗口
  Then 不存在 quickpanel renderer 进程；首次双击热键后零点几秒内面板出现，之后与原先一致即时。

## 测试

`quickpanel-window.test.ts`（窄 fake Electron，`vi.resetModules` 逐用例隔离）：首唤延迟到就绪、挂起期重触不双 show、常驻复用不重建、未创建时 hide no-op、加载失败兜底；`main-quickpanel-bootstrap.test.ts` 源码守卫。

## 并发结论

支持；本任务由主会话串行执行。

## 实施摘要（2026-09-23）

- `main.ts` 删除预创建调用与 import（`syncQuickPanelTrigger` 保留），注释更新为懒创建语义。
- `quickpanel-window.ts`：`createQuickPanelWindow` 收回模块私有；新增 `firstShowPending` 与 `revealQuickPanelWindow`（展示前幂等挂玻璃，消除 mac「实心→玻璃」闪变）；`did-fail-load` 兜底过滤 `isMainFrame`；`loadURL` 拒绝路径同步解除挂起。
- 实现修正设计一处：`ready-to-show` 是 BrowserWindow 事件而非 webContents 事件（tsc 拦下），挂载点改为窗口。
- 验证：`quickpanel-window.test.ts` 6 用例（窄 fake Electron + `vi.resetModules` 隔离）+ 源码守卫 1 用例 + 相邻 `shortcut-service.test.ts`、`ipc/quickpanel.test.ts` 回归全过；`tsc -p apps/desktop` 与 `check:quick` 通过。
- 发布说明 v0.5.59「改进」已补条目（含首唤延迟与最近会话列表加载态的代价说明）。
