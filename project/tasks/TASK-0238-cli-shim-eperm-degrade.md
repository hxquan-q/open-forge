---
id: TASK-0238
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0089（Windows 打包版每次启动安装 CLI shim 因目标文件被占用报 EPERM: copyfile）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0089]
execution: serial
branch:
worktree:
base_commit: 1ea3432
read_paths: [apps/desktop/src/main/dev-cli-shim.ts, apps/desktop/src/main/main.ts, project/bugs/BUG-0089-packaged-cli-install-eperm.md]
write_paths: [apps/desktop/src/main/dev-cli-shim.ts, apps/desktop/src/main/dev-cli-shim.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0089-packaged-cli-install-eperm.md, project/tasks/TASK-0238-cli-shim-eperm-degrade.md, project/tasks/README.md]
created: 2026-10-12
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# Windows CLI shim 目标占用降级：内容等价静默跳过、真差异有界重试 + warn 降级

## 目标

`copyFileIfChanged` 的 mtime/size 前置跳过后仍直调 `copyFile`——目标 `.exe` 被占用（他进程/AV）即 `EPERM` 冒泡成每次启动一条 `failed to install vetta CLI paths` error。修复后：内容等价→静默成功；真有差异→有界重试后按「占用待更新」warn 降级，启动不再被 error 刷屏。

## 方案

- `copyFileIfChanged` 捕获 `EPERM`/`EBUSY` 时先比对源/目标内容（size 先判、相等再读字节比）：
  - 等价 → 直接返回（目标已是最新，只是被锁——无需任何动作）。
  - 有差异 → 有界重试 `copyFile`（吸收 AV 类瞬态锁）；仍占用 → 抛类型化 `CliShimTargetLockedError`。
- `ensureOpenForgeCommandShim` 捕获该错误 → `console.warn` 一条（命令 shim 已存在且可执行，仅内容待下次启动更新）；其余错误照常冒泡到 `main.ts` 现有 error 日志。
- 重试预算走可注入参数（默认 ~3 次 ×250ms），测试用 0 预算确定性断言。
- 非 `EPERM`/`EBUSY` 错误原样冒泡，非 Windows 路径行为不变。

## 边界

- 不断言锁持有者身份（实机证据不足以区分他实例/子进程/AV）。
- 不做跨启动延迟重试调度——下次启动自然再尝试。
- `persistVettaCliPaths` 行为不变；`assertExecutable` 校验保留。

## 验证

- 新建 `dev-cli-shim.test.ts`：tmpdir 真实 fs——等价目标 EPERM 静默、差异目标重试耗尽后 `CliShimTargetLockedError`→warn、正常升级照常 copy、非占用错误冒泡。
- `bunx tsc --noEmit`；desktop 定向测试全绿。
