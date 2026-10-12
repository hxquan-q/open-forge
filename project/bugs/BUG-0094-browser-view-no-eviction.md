---
id: BUG-0094
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检第二轮（反馈内置浏览器卡顿、加载慢）+ 代码审查
related_requirement: []
related_plan: []
related_tasks: [TASK-0039, TASK-0072]
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器 `WebContentsView` 按工作区永久常驻、无回收上限，渲染进程随使用线性累积

## 用户流程

- Given：用户在多个工作区/项目会话中陆续打开过内置浏览器页签。
- When：每开过一个工作区的浏览器，`InAppBrowserViewHost.ensureView` 为其创建一个 `WebContentsView`（独立渲染进程，约 50–150MB）；`detach` 只摘不毁。
- Then：期望非活动 view 有界回收；实际 `views` Map 无任何驱逐，直到窗口销毁才 `disposeAll`——开过的每个工作区永久占一个渲染进程。

## 实际行为

`browser-view-host.ts`：`views` 按 workspaceId 持有，`detach` 置 `attached=false` 但保留 view 存活（注释「view 常驻存活（切 workspace 只摘不显式销毁）」），唯一的销毁点是窗口级 `disposeAll`。用户反馈「browser 使用很卡顿、加载慢」；与 TASK-0039 给插件 pinned 页签加上限（`DEFAULT_INACTIVE_PINNED_TAB_LIMIT = 3`，每个 guest 一个独立渲染进程）记录的是同一放大模式，浏览器面板没有等价边界。

## 期望行为

非活动（detached）浏览器 view 设上限并按最近使用 LRU 驱逐：超限即销毁最久未用的 detached view（`webContents.close()`）；被逐工作区重新 attach 时由 renderer 随 attach 携带的 workspace URL 自动重建并 `loadURL`（`useBrowserPanelModel` attach 恒带 `targetUrl`），页面可逆恢复。

## 环境与失败证据

- 用户实机反馈（0.1.3 打包版）浏览器卡顿、加载慢；日志侧无直接帧率/导航计时指标，但同机渲染进程持续累积是可复现的结构性问题。
- 同日志窗口内另有每次拖拽必现的 `setIgnoreMouseEvents` TypeError 风暴（BUG-0086 已修）——叠加在已累积的常驻进程上进一步放大卡顿感。

## 最小复现

1. dev/打包版在 ≥4 个不同工作区各开一次内置浏览器页签并切走。
2. 观察进程列表：`WebContentsView` 对应渲染进程数等于「开过浏览器的工作区数」，切走不减少。

## 影响

长会话/多工作区用户的主进程管理的渲染进程数无界增长，整机 GUI 卡顿、内存占用攀升；与窗口共存亡，唯一的缓解是重启应用。

## 根因证据

- [`browser-view-host.ts`](../../apps/desktop/src/main/browser-automation/browser-view-host.ts) `ensureView`/`detach`/`disposeAll`：无驱逐路径，`detach` 保活是显式设计（注释原文），但缺少配套上限。
- TASK-0039 同型先例：插件 pinned 页签 `DEFAULT_INACTIVE_PINNED_TAB_LIMIT = 3` + LRU 驱逐，证明该模式在本仓库已被认定为缺陷类放大。
- `webview-session-host.ts` 的 `destroyed → controller.detachWebContents` 已接线，`contents.close()` 驱逐可自动解绑会话控制器，无悬挂引用。
- 置信度：高（代码级确定；「卡顿」与该结构的因果链为合理推断，逐出上限本身是独立成立的健壮性修复）。

## 回归测试

`apps/desktop/src/main/browser-automation/browser-view-host.test.ts`：超过 detached 上限时最久未用的 view 被销毁、当前 attach 的 view 永不驱逐、被逐工作区重新 attach 会重建新 view 并按 attach url 重新加载。旧实现下「超限销毁」断言失败（红基线：destroyed 恒为 false）。

## 修复与验证

- 修复：见 [TASK-0229](../tasks/TASK-0229-browser-view-lru-eviction.md)。detached view 上限 `MAX_DETACHED_BROWSER_VIEWS = 3` + `lastUsedAt` 单调序号 LRU 驱逐（attach/detach 边界执行，attached 永不驱逐，destroyed 条目顺手清表）；`webContents.close()` 经既有 `destroyed → detachWebContents` 接线自动解绑会话控制器；`BrowserViewContents` 新增 `close()`。
- 测试：`browser-view-host.test.ts` 18/18 过（超限驱逐含被逐重开恢复、attached 豁免与刚 detach 不被逐两例新增；旧实现红基线）；desktop impact 190 例过（4 个套件因 `window-manager.ts` `process.resourcesPath` 既有问题红，与本改动无关）。
- 检查：desktop `typecheck:incremental` 绿；改动文件 biome 绿；`check:quick` 仍被 `.ua/` 既有 guard 残留阻断（非本改动）。
- 验证边界：上限值 3 为对齐 TASK-0039 pinned 页签的默认口径，非实测调优值；「卡顿缓解」属结构性改善，实机帧率/内存对比属人工验收面。
