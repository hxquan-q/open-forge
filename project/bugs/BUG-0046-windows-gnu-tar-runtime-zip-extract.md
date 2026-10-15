---
id: BUG-0046
type: bug
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source: dev 日志巡检（~/.openforge-dev main log 2026-09-28）
related_requirement: []
related_plan: []
related_tasks: [TASK-0130]
related_issues: []
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# Windows 上 PATH 含 GNU tar 时托管 Node runtime 解压 zip 必失败

## 用户流程

- Given：Windows 用户首次启动 Desktop，本机未内置 vendor runtime，PATH 中 GNU tar（Git Bash / MSYS2 / Scoop Git 的 `usr/bin/tar`）排在 System32 bsdtar 之前。
- When：RuntimeManager 后台下载 Node runtime（npmmirror → nodejs.org 两个源）。
- Then：应下载并解压 `node-v22.22.2-win-x64.zip` 完成安装；实际两个源均在解压阶段失败，日志报 `zip extract failed: tar: This does not look like a tar archive`，最终 `node download failed from all sources; panel retry available`，设置面板重试也永远失败。

## 实际行为

`spawnSync("tar", ["-xf", ...])` 命中 GNU tar 1.35，GNU tar 不支持 zip，解压失败；Node runtime 永远无法就绪。

## 期望行为

zip 归档不依赖外部 tar 实现，解压成功并完成 Node runtime 安装；tar 仅用于 tar.gz。

## 环境与失败证据

- Open Forge dev（main @ `aaf85f02e`）/ Windows 11 / `tar (GNU tar) 1.35`（`which -a tar` 显示 `/usr/bin/tar`、`/bin/tar` 先于 `/c/WINDOWS/system32/tar`）。
- `~/.openforge-dev/desktop-app/logs/main/2026-09-28.log` 09:23:21 与 09:23:54 两条 download failed，stderr 为 GNU tar 风格报错（bsdtar 报的是 "Unrecognized archive format"）。
- 本机 `~/.openforge-dev/runtimes/` 下无 node 目录，仅 `.cache` 里有下载产物。

## 最小复现

1. Windows 上保证 GNU tar 在 PATH 中先于 System32 tar（Git Bash 默认即如此）。
2. 删除 `~/.openforge-dev/runtimes/node` 后启动 dev。
3. 观察 main 日志两个源均 `zip extract failed`。

## 影响

受影响机器（Windows + 任意 GNU tar 先行，极常见）Node runtime 安装必失败，依赖该 runtime 的能力不可用；重试无意义。

## 根因证据

[`runtime-archive-installer.ts`](../../apps/desktop/src/main/runtimes/runtime-archive-installer.ts) `extractArchive` 对所有归档统一调 `tar -xf`，注释假设 Windows bsdtar 支持 zip；已有 tar flavor 探测只用于决定是否加 `--force-local`，未处理「GNU tar 不支持 zip」的能力缺口。BUG-0023 修过同一函数的 bsdtar 兼容面，本次是另一面。

## 回归测试

旧实现下：构造 archiveType 为 `zip` 的安装路径，在 GNU tar 先行（或直接桩住 tar 输出 GNU 风格报错）时安装失败；修复后 zip 走内置解压器成功。

## 修复与验证

- 修复：见 [TASK-0130](../tasks/TASK-0130-runtime-zip-extract-without-tar.md)（集成提交 `9d6981fac`，merge `32012e373`）。zip 归档改走进程内 `extractZipArchiveSafely`，不再 spawn `tar`；tar.gz 路径不变。
- 测试：`runtime-archive-installer.test.ts`——zip 安装断言 `spawnSync` 零调用（GNU tar 环境等效证伪）；tar.gz 仍走 tar；损坏 zip 报错且保留旧 runtime。
- 检查：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/runtimes/runtime-archive-installer.test.ts`（9 passed / 1 skipped）；批次 `test:changed --base origin/dev` 与 `check` 由 Coordinator 统一执行。
- 未运行及原因：真实 GNU tar 环境下删 runtime 目录的 dev 端到端复装属人工冒烟，未执行；状态保持 verifying。
