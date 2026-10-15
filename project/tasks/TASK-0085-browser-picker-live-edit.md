---
id: TASK-0085
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0007
source: RESEARCH-0006; user-request（browser 元素选择→修改页面实时联动，Cursor Design Mode 边界）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/browser-automation, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/preload]
write_paths: [apps/desktop/src/main/browser-automation, apps/desktop/src/main/ipc, apps/desktop/src/preload, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/shared/i18n/locales]
exclusive_paths: []
depends_on: [TASK-0062, TASK-0075, TASK-0082]
conflicts_with: [TASK-0072]
integration_status: integrated（forge/dev 主工作区，Phase 1-2 随本轮原子提交落地；Phase 3 为核对结论无代码）
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# Browser 点选元素 → 页面内实时改稿（设计模式 v1）

## 目标

内置 Browser 的元素点选从「捕获+截图附件」升级为「选中即改」：用户在 WebView 内选中元素后，可以在 picker 面板上即时调整样式/文本并立刻在页面上看到效果；确认后把「元素定位 + 逐项前后值 + 截图」作为结构化上下文交给 Agent，由 Agent 把意图落到源码。

边界与 Cursor Design Mode 一致：**改动只作用于 WebView DOM 即时预览**，不直接写回源文件（选择器→源码映射歧义与误改风险由 Agent 环节消化，用户已确认该边界）。

## 范围

### 做

- guest 侧 live-edit 原语：对命中元素应用/撤销内联样式与文本编辑，记录逐项 before/after；函数体可 `.toString()` 注入、不引用模块绑定。
- host/IPC：picker 会话期 live-edit 通道（apply / revert / list），随 picker 关闭自动清理全部改动。
- renderer：点选命中后显示编辑面板（常用样式控件 + 文本编辑 + 还原 + 发送到会话）；ESC/关闭 picker 时提示并还原。
- 附件：picker 草稿 JSON 增加 `liveEdits`（property, before, after），Agent 据此定位与落地。
- 定向单测：guest 纯函数（应用/撤销/记录/拒绝表单控件值以外字段）、renderer hook。

### 不做

- 不改动 `browser_tab` 工具合同与审批流。
- 不写回源文件、不做 xpath→源码映射。
- 不做 Canvas HTML 内点选（PLAN-0007 另行条目）。
- 不碰 WebContentsView 迁移（TASK-0072）。
- 真实 WebView 坐标 E2E（需 `verify:ui:*` 授权）。

## Given / When / Then

- Given：picker 武装且点击命中 `#go` 按钮；When：面板把 color 改为 red；Then：WebView 内按钮立刻变红，`liveEdits` 记录 `{property:"color", before, after:"red"}`。
- Given：存在两条 liveEdits；When：用户点「还原」；Then：全部改动撤销，页面回到原始状态。
- Given：存在 liveEdits；When：用户确认发送；Then：附件 JSON 含元素定位 + liveEdits 前后值，页面改动保留到 picker 会话结束。
- Given：存在 liveEdits；When：用户关闭 picker；Then：改动自动撤销，不留脏页面。

## 测试与验证

- `webview-live-edit.test.ts`（guest 纯函数）、`useBrowserElementPicker` 扩展用例、IPC 合同测试。
- `bun run test:impact -- <files>` + `bun run check:quick -- <files>`。

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

内置浏览器点选元素后可直接在页面上实时调整样式与文本，确认意图后连同前后值一并交给 Agent 修改源码；Canvas 页签打开中的产物会随 Agent 写入实时刷新。

## 交付记录

### Phase 1：Browser 选中元素→页面内实时改稿（完成）

- guest：`webview-live-edit.ts` 提供 apply/revert 原语（样式白名单 `BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS`、文本仅叶子元素、条数上限 `BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS`、值截断），picker guest runtime 改为 `deps` 显式注入（免疫打包器改名），新增 `apply-edit`/`revert-edit`/`revert-all-edits`/`edit-state` 命令；pick 命中记录元素引用，`stop` 自动还原全部改动。
- host/IPC：`vetta:browser-tab:live-edit` channel + `DesktopBrowserTabLiveEditRequest`；controller 追踪 `lastPickedRef`，导航/换选/关 picker 后拒绝 stale 引用（`stale_reference`）。
- renderer：`useBrowserLiveEdit` hook + theme-ui `BrowserLiveEditCard`（非受控表单，无 hooks 依赖）；点选结果不再立即落稿，改为编辑卡片，「发送」才将含 `liveEdits` 的选择上下文交给 Agent。
- 合同：`element-selection-capsule` 增加可选 `liveEdits`（`kind`/`property`/`before`/`after`/`target`），向后兼容。
- 测试：guest 11 例、controller 10 例、hook/组件 31 例、capsule 4 例，全绿。

### Phase 2：Canvas 打开产物实时刷新（完成）

- `useCanvasTabModel`：打开中的 artifact 订阅 `canvasArtifactRevisionAtom`（`artifact.descriptor` 事件驱动），版本写入即重取 `canvas:get` 刷新预览；`get` 失败一律回落 `missing`（listed 仅保留标题/kind 元数据，旧逻辑会掩盖已删除状态）；`saveToProject` 后经 `refreshNonce` 强制重取。
- `t`/`kindLabel` 经 `formatRef` 注入避免 i18n mock/语言切换导致的每渲染重取；`items` 经 `itemsRef` 读取避免列表刷新连带重取内容。
- 测试：`useCanvasTabModel.test.tsx` 新增 3 例（revision 到达重取新内容、取不到回落 missing、未选中不拉取），7/7 绿；补回 Phase 1 遗漏的合同夹具更新（`canvas-browser-contracts` channel 冻结 + `canvas-browser-tab` IPC 计数/liveEdit 桥接）。

### Phase 3：Agent 内核→Canvas 联动（核对结论：现有合同已满足）

- 链路核实：`artifact` 工具 create/update 逐版本记录 `artifact.descriptor.recorded` → `kernel-session-events` 映射为 `artifact.descriptor` → `useSessionEventController` bump `canvasArtifactRevisionAtom` → Canvas 列表与打开预览实时刷新。版本粒度实时联动已端到端贯通，无需新增事件合同。
- 子版本 token 级流式（artifact.content.delta）需要新增持久化事件合同（record-schema/projection/kernel-events），属另一独立条目，本任务不做。
- Browser→Agent 方向已由 Phase 1 的 `liveEdits` 结构化胶囊完成。

### 验证

- 定向：browser-automation + activity-panel hooks + canvas/browser 合同与 IPC，24 文件 102 例通过（`useFloatingActivityTabs` 2 例失败为既有 React 19.3.0/19.2.8 双版本环境漂移，与本次无关）。
- `bun run check:quick` 全绿；desktop `tsc --noEmit` 本任务文件 0 错误。
- `CanvasTabPanel.test.tsx` 基线即失败（同一 React 双版本问题），非本次引入。
