---
id: TASK-0039
type: task
status: draft
priority: P2
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-5
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/plugins]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/plugins, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# webview 剩余口子收口：插件 pinned 上限 + 面板收起卸载校验

## 目标

`activity-tab-residency.ts:4,24` 的 warm=2 + 空闲逐出已生效，唯一无界口子是插件页签声明 `keepAliveWhenAvailable===true` 的 pinned（`plugin-ui-context.ts:353`）。每个 guest webview 是一个独立渲染进程（估算 50–150MB），pinned 无上限即可无限累积。

## 范围

### 并发评估

- 结论：支持——activity-panel/plugins 目录与在途任务无交集；防御性收口，优先级 P2 可排队。

### 做

- 插件 pinned 页签设总量上限或 LRU 驱逐（属行为变更，随插件 API 版本化说明）；
- 校验活动面板整体收起时 webview 是否卸载（当前保留 DOM 挂载的 warm 语义是否符合合同）；
- 一次性预览场景评估改非 persist 分区（磁盘收益顺带）。

### 不做

- 不动 warm=2 + 空闲逐出既有语义；
- 不降级 webview 的 sandbox/contextIsolation 安全姿态；
- 不手动限制 Chromium 进程数（render_process_host 自适应上限默认生效）。

## Given / When / Then

- Given：多个插件页签声明 pinned 保活
  When：pinned 数超过上限
  Then：最久未用的 pinned 被逐出（页签可透明重建），guest 渲染进程数有硬上限

## 必须保持

- pinned 是插件显式契约：驱逐必须可恢复，逐出后再次打开状态可重建；
- warm 语义与空闲逐出既有行为不回退。

## 测试与验证

- 定向测试：pinned 超限驱逐、逐出后重建、面板收起时 guest 进程计数断言（`app.getAppMetrics()`）；
- 用户流程：开多个插件页签→收起面板→展开→pinned 页签恢复；
- 质量检查：`check:quick`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
