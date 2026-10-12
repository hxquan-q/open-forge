---
id: BUG-0089
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检（main 2026-10-08 至 2026-10-10）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# Windows 打包版每次启动安装 CLI shim 都因目标文件被占用报 `EPERM: copyfile`

## 用户流程

- Given：Windows 打包版（版本目录布局），`%USERPROFILE%\.openforge\agent\bin\openforge.exe`（或 `vetta.exe`）此前已被安装。
- When：应用启动时执行 CLI 安装/对齐（`persistVettaCliPaths`）。
- Then：已安装且内容一致时应幂等跳过；需要更新但目标被占用时应降级为重试或告警；实际每次启动都 `EPERM: operation not permitted, copyfile` 直接落 error。

## 实际行为

`failed to install vetta CLI paths EPERM: operation not permitted, copyfile <runtime>\bin\openforge.exe -> <用户>\.openforge\agent\bin\openforge.exe` 在 0.1.1 与 0.1.3 每次启动都出现（main 日志累计 13 次），同批 idle 任务整体被拖到 `runtime-and-cli` 最长 7.2s，并被计入 `startup idle task is very slow`。

## 期望行为

CLI shim 安装对用户不可见：同版本/同内容时跳过复制；目标被运行中进程占用时不报错刷屏，采用临时文件重命名、延迟重试或明确的一次性告警。

## 环境与失败证据

- Open Forge 0.1.1（`%LocalAppData%\Programs\vetta`）与 0.1.3（`D:\Coding\OpenForge\...`）打包版，Windows。
- `temp/log/main/` 9 月 28 日至 10 月 10 日：每次启动 `agent:cli-install failed to install vetta CLI paths … EPERM … copyfile`；期间 `startup idle task is very slow: runtime-and-cli` 多次 2.7–7.2s。
- 该机 `~/.openforge` 被两个安装共用，agent 子进程可能持续持有 `agent/bin/openforge.exe`——占用者尚未在该机确认，也可能为杀软锁定，属于待证实的上游诱因。

## 最小复现

1. Windows 上让 `~/.openforge/agent/bin/openforge.exe` 被任一进程持有（或直接以无权限方式占位）。
2. 启动打包版 → 启动日志出现 `failed to install vetta CLI paths … EPERM`。

## 影响

CLI 安装/升级静默不可靠（目标 exe 可能长期停留在旧版本），每次启动刷 error 日志并拖慢启动 idle 队列；对多版本/多实例共存环境尤为脆弱。

## 根因证据

- [`apps/desktop/src/main/main.ts`](../../apps/desktop/src/main/main.ts) 启动路径 `persistVettaCliPaths`（约 757 行）经 `ensureOpenForgeCommandShim` 无条件 `copyFile` CLI exe 到 `~/.openforge/agent/bin/`，catch 后整段记 `failed to install vetta CLI paths` error——没有「目标已是同版本则跳过」「占用冲突降级」任何兜底。
- Windows 对运行中/被映射的 exe 拒绝覆盖写是 OS 级事实，与日志 `EPERM: copyfile` 签名一致。
- 置信度：失败机制高（代码路径确定 + 平台行为确定）；锁占用者身份为中置信假设（需该机确认）。

## 回归测试

以 fake fs 让 `copyFile` 对目标抛 `EPERM`，断言：(a) 目标内容与源一致时根本不发起复制；(b) 占用冲突时按设计降级（重试/一次性 warn），不再每次启动落 error；(c) idle 任务不因该失败异常拉长。旧实现下 (a)(b) 均失败。

## 修复与验证

- 修复：`copyFileIfChanged` 捕获 `EPERM`/`EBUSY`/`EACCES` 后先分块比对源/目标内容——等价直接返回（目标已是新版，仅被锁）；有差异按可注入重试预算（默认 3×250ms）吸收瞬态占用，仍锁则抛类型化 `CliShimTargetLockedError`；`installBinaryCommandShim` 捕获它降 `console.warn`（shim 仍可执行，升级留待下次启动），其余错误照常冒泡到既有 error 日志（TASK-0238）。
- 测试：新建 `dev-cli-shim.test.ts` 7 例——等价目标占用静默、差异目标重试耗尽抛 typed error→warn、重试预算计数、正常升级、非占用错误冒泡；tmpdir 真 fs + chmod 只读模拟占用，跨平台确定性。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 未运行及原因：锁持有者身份未实机确认（机制修复不依赖归因）；真机验证待打包版复核。
