---
id: BUG-0090
type: bug
status: investigating
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main 2026-09-28 至 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# Windows Inno 打包版通用 updater 检查确定性失败：`app-update.yml` 缺失与 feed 404 每次启动刷屏

## 用户流程

- Given：Windows Inno 打包版运行（`versions/<x.y.z>` 目录布局）。
- When：应用按周期或手动触发「检查更新」。
- Then：应命中有效更新源并给出「有更新/已最新」结论；实际两类确定性失败刷屏：`ENOENT resources\app-update.yml` 与 `HttpError: 404`。

## 实际行为

每次启动后 updater 检查固定失败：`Error: ENOENT: no such file or directory, open '…\resources\app-update.yml'`（0.1.1 36 次、0.1.3 9 次）与 `[updater] check failed HttpError: 404`（17 次）。Inno 打包产物本就不含 `resources/app-update.yml`（builder 配置 `publish` 关闭），而 feed 返回 404 说明通用检查指向的更新清单不存在或未发布——真实更新能力是否可用无法从日志区分。

## 期望行为

Windows Inno 版本只走 `InnoWindowsUpdateController` 自研检查通道；不适用的 electron-updater 检查不发起，或把「无 feed 配置/feed 未发布」映射为一次性的「暂无更新」结论而非周期性 error 刷屏。

## 环境与失败证据

- 0.1.1（`%LocalAppData%\Programs\vetta\versions\0.1.1`）与 0.1.3（`D:\Coding\OpenForge\OpenForge\versions\0.1.3`）打包版，Windows。
- `temp/log/main/2026-09-28.log` 至 `2026-10-10.log`：`check failed … app-update.yml` ENOENT 45+ 次、`HttpError: 404` 17 次，分布在每次启动与周期检查点。

## 最小复现

1. 打包并安装任一 Windows Inno 产物。
2. 启动应用等待一次 updater 检查（或手动触发）。
3. main 日志出现 `app-update.yml` ENOENT 或 feed 404。

## 影响

更新检查对用户与运维都不可信：若 Inno 通道本身另有依赖，通用检查的持续失败会掩盖真实更新问题；每次启动刷 error 日志干扰诊断。

## 根因证据

- [`apps/desktop/src/main/updater.ts`](../../apps/desktop/src/main/updater.ts) 初始化 electron-updater 的 `autoUpdater`，E2E feed 只在 `VETTA_E2E=1` 配置；[`updater-engine.ts`](../../apps/desktop/src/main/updater-engine.ts) 的通用 `checkForUpdates` 仍会被周期/手动路径调用。
- Inno 打包（`scripts/build/run-electron-builder.js` `publish` 关闭）不生成 `resources/app-update.yml`，electron-updater 检查必然 ENOENT——机制层面确定性失败。
- feed 404 指向更新清单未发布或 URL 错误，属发布侧问题，但客户端应把它当结论而非异常。
- 置信度：ENOENT 机制高；404 根因中（需核对 R2 feed 发布状态与 URL）。

## 回归测试

打包装配断言：Inno 产物布局下 updater 不再发起 electron-updater 检查（或检查前先验证 `app-update.yml` 存在并短路）；feed 404 响应映射为「无更新」结果而非 `check failed` error。旧实现下两类断言均失败。

## 修复与验证

- 修复：待定；需要确认 Windows 更新架构合同——Inno 自研通道与 electron-updater 是否应互斥。
- 测试：上述断言 + `updater-engine` 单测。
- 检查：定向 desktop vitest；feed 状态需另行核对发布流水线产物。
- 未运行及原因：尚未进入修复 Task；feed 404 真实根因待发布侧确认。
