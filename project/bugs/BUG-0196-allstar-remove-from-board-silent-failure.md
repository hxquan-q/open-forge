---
id: BUG-0196
type: bug
status: in_progress
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan:
source: user-report-2026-11-19 + 主进程日志
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0194]
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# 版块「从版块移除」移除成功但卡片不消失，再点即静默报 Project not found

## 用户流程

- Given：版块首页的项目卡片，该项目下仍有 coding 会话；项目当前已在版块册（`allstarProjects`）登记。
- When：点卡片 `···` 菜单里的「从版块移除」。
- Then：该卡片从版块消失；重复点击不应产生任何错误。

## 实际行为

1. 第一次点击**成功**：`desktop-config.json` 的 `allstarProjects` 少了该条目（本机实测由 5 条变 4 条）。
2. 卡片**没有消失**——它仍由会话池里的 coding 会话聚合重建。
3. 用户再点同一项，主进程抛 `Error: Project not found: <cwd>`（2026-11-19 17:48:22 / 17:48:27 / 17:48:30 / 17:53:11 各一次），渲染端把错误吞掉，界面毫无反馈。

## 期望行为

- 已移除/未登记的卡片不应再提供「从版块移除」，或点击后明确告知「已不在版块册」。
- 移除成功后，卡片要么消失，要么明确呈现「未登记」状态，而不是保持原样让用户反复点击。

## 环境与失败证据

- Windows 11 x64；桌面端 0.1.5 开发线，HEAD `4c3903435`；2026-11-19 用户报告。
- 主进程日志（4 次同文）：

```text
[error] [console] Error occurred in handler for 'vetta:projects:remove-allstar':
  Error: Project not found: <项目 cwd>
  at getDesktopProjectService().remove(asString(path), "allstar")
```

- 配置证据：错误发生时 `desktop-config.json#allstarProjects` 已不含该路径（剩余 4 条），说明移除已成功、错误来自重复提交。
- 基线对照：移除前该路径在 `allstarProjects` 中存在，第一次点击后消失。

## 最小复现

1. 选一个已登记版块册、且仍有 coding 会话的项目卡片。
2. 点「从版块移除」——配置里条目消失，但卡片仍在。
3. 再点一次「从版块移除」。
4. 观察：界面无任何反应，主进程日志多一条 `Project not found`。

## 影响

- 该入口对用户表现为"点了没用"：卡片不消失、无提示、可无限重复触发失败。
- 对从未登记、仅由会话池聚合出的卡片（`registered === false`），这一项**必然**失败，属于假可交互（与 BUG-0194 同族）。
- 每次重复点击都会写一条 error 日志，且错误信息把"已移除"包装成"找不到项目"，会误导后续排查。

## 根因证据

三条独立成因叠加：

1. **卡片不只由登记册驱动**：`useAllstarDevHomePageModel` 同时用 `allstarProjects` 和 `sessionsMap`（`agentMode === "coding"` 的会话）建组，移除登记后组仍会由会话池重建，因此卡片不会消失。model 已经算出 `registered` 字段，但 `AllstarDevHomePageView` 的卡片菜单三项是无条件渲染，没有消费它。
2. **移除非幂等**：`project-service.ts` 的 `remove()` 在目标不在册内时直接 `throw new Error("Project not found")`，而不是静默成功。
3. **失败被吞**：`onRemoveFromBoard` 的失败出口是 `.catch(() => undefined)`，既不提示也不回滚任何 UI 状态。

## 回归测试

计划用例，修复前先红：

1. View 级：`registered === false` 的卡片不渲染「从版块移除」菜单项；`registered === true` 时行为不变。
2. Model 级：`removeAllstar` 成功后刷新册清单；失败（含 `Project not found`）时必须产生用户可见反馈，不得静默。

## 修复与验证

- 修复：未开始。候选方向——菜单按 `registered` 收口；`remove` 对不存在条目改为幂等；移除成功后若卡片仍由会话残留展示，给出「未登记」状态而不是原样保留。
- 测试：未编写。
- 检查：未运行。
- 未运行及原因：用户尚未授权修改主仓实现；本轮仅只读调查与建档。
