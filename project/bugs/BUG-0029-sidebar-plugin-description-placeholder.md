---
id: BUG-0029
type: bug
status: done
priority: P3
owner: apps/desktop
source: agent-browser 现场测试（侧边栏导航 tooltip 出现原始 %key% 占位符）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0028]
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 插件工作区视图 description 未过 i18n 解析，侧边栏 tooltip 显示原始占位符

## 用户操作流程

1. 启动 Desktop，确保任一声明 `description` 的插件工作区视图已加载
   （如 vetta-ui-design 的「设计」入口）；
2. 鼠标悬停或查看侧边栏导航项的 title/tooltip。

## 实际行为与期望行为

- 实际：tooltip 显示 `设计 · %gallery.nav.description%`——label 已解析成中文，
  description 却是原始 `%key%` 占位符。
- 期望：label 与 description 都经宿主 `resolvePluginText` 按插件目录解析，
  tooltip 显示 `设计 · 所有带设计稿的项目`。

## 最小复现

- CDP 实测：`document.querySelector('[title*="设计"]')` 的 `title` 为
  `设计 · %gallery.nav.description%`。
- 单测基线：旧实现下 `useSidebarModel` 产出的 `title` 包含未解析占位符。

## 影响

用户可读的提示信息泄露内部 i18n key；任何给 `registerWorkspaceView` 传
`%key%` description 的插件都会中招，属于占位符合同的系统性漏解析（P3，
纯展示层，功能不受影响）。

## 根因

`useSidebarModel` 组装插件工作区导航项时，`label` 经
`usePluginTextResolver` 解析，但 `toWorkspaceNavItem` 直接把
`view.description` 原文拼进 `title`，绕过了解析层
（`pluginWorkspaceViewsAtom` 的注释本就声明 description 可能是 `%catalogKey%`，
由消费方解析）。

## 回归测试

- `apps/desktop/src/renderer/domains/project/components/sidebar/useSidebarModel.workspace-view.test.tsx`：
  覆盖 `%key%` description 被解析进 title、description 缺省时回落
  `label · pluginName` 两条路径。

## 修复与验证

- 修复：`useSidebarModel` 在构造导航项前先把 `view.description` 过
  `resolvePluginText`，与 label/badge 同一层解析。
- 测试：`cd apps/desktop && bun run test -- src/renderer/domains/project/components/sidebar/useSidebarModel.workspace-view.test.tsx`（2/2 通过）。
- 实机验证：CDP 重载后 `title="设计 · 所有带设计稿的项目"`，页面内不再存在
  未解析的 `%…%` aria-label。
