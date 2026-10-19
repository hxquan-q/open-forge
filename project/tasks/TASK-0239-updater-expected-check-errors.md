---
id: TASK-0239
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0090（Windows Inno 打包版通用 updater 检查确定性失败：app-update.yml 缺失与 feed 404）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0090]
execution: serial
branch:
worktree:
base_commit: 1ea3432
read_paths: [apps/desktop/src/main/updater-engine.ts, apps/desktop/src/main/updater-service.ts, apps/desktop/src/main/updater.ts, apps/desktop/src/main/inno-windows-update.ts, apps/desktop/src/main/updater-engine.test.ts, project/bugs/BUG-0090-inno-packaged-updater-check-fails.md]
write_paths: [apps/desktop/src/main/updater-engine.ts, apps/desktop/src/main/updater-engine.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0090-inno-packaged-updater-check-fails.md, project/tasks/TASK-0239-updater-expected-check-errors.md, project/tasks/README.md]
created: 2026-10-12
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# updater 检查错误分类：无 feed 配置与 feed 404 降为「配置不可用」结论

## 目标

Inno 打包 `publish: false` 不产 `app-update.yml`——`electron-updater.checkForUpdates()` 确定性 ENOENT；feed 未发布时另得 `HttpError 404`。两者经 `check failed` + `updater.on("error")` 双通道每次启动刷 error。修复后：两类「通道未配置」错误映射为 `null` 返回（service 侧即 `configurationUnavailable` 结论态），进程内一次性 info 日志；其余错误照常 error。

## 方案

- `ElectronUpdaterEngine` 新增 `isExpectedCheckUnavailable(error)`：`code === "ENOENT"` 且消息含 `app-update.yml`；或 `HttpError`（builder-util-runtime）`statusCode === 404`。
- `checkForUpdates()` 捕获后命中分类 → `notifyExpectedCheckUnavailableOnce`（`console.info`，按错误类各记一次）→ 返回 `null`；未命中 → 原样抛出。
- `updater.on("error")` 监听器同分类：命中 → 一次性 info 且不再 `console.error`；未命中 → 维持 error（防 EventEmitter 未监听冒泡的语义不变）。
- Inno 通道不受影响：`innoWindowsUpdate` 仍从成功的 `checkForUpdates` 结果 `select`——feed 一旦发布即自动恢复工作，不预先跳过检查。

## 边界

- 不实现「Inno 版本不发起 electron-updater 检查」——Inno 通道的 updateInfo 来源就是该检查，跳过等于断更源。
- 发布侧 feed 缺失属仓库外问题，不在本修复内宣称解决。
- `null` → `configurationUnavailable` 沿用既有状态映射，不新增 i18n 键。

## 验证

- `updater-engine.test.ts` 新增：ENOENT 拒绝→`null` 且不 error、404→`null`、同类重复命中只记一次 info、意外错误仍抛 + error 事件仍 error。
- desktop `tsc --noEmit` 与定向测试全绿。
