---
id: BUG-0023
type: bug
status: done
priority: P1
owner: apps/desktop
source: 本地运行 `bun run --cwd apps/desktop test src/main/runtimes/runtime-archive-installer.test.ts` 的失败输出
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# Windows 自带 bsdtar 不认识 `--force-local`，托管运行时安装失败

## 用户操作流程

1. 在一台没有 Git/MSYS2 的 Windows 机器上启动 Desktop；
2. 触发需要托管运行时（Node/CLI）的功能（首次运行或按需安装）；
3. 应用下载运行时归档（`tar.gz` 或 Node 官方 `zip`）后调用 `installRuntimeArchive` 解压。

## 实际行为与期望行为

- 实际：`tar` 以状态码 1 退出并输出 `tar: Option --force-local is not supported`，安装抛
  `zip extract failed: ...`，托管运行时无法安装；错误信息里看不到「参数不被支持」的根因提示。
- 期望：进程能按本机 `tar` 实现选择参数形态，正常解压并完成安装。

## 最小复现

```bash
tar --version                     # Windows: bsdtar 3.8.4 - libarchive 3.8.4
mkdir -p %TEMP%/t/src/runtime/bin && echo hi > %TEMP%/t/src/runtime/bin/tool
cd %TEMP%/t/src && tar -czf ../r.tar.gz --force-local -C . runtime
# → tar: Option --force-local is not supported（状态码 1）
```

回归测试（旧实现必失败）：`apps/desktop/src/main/runtimes/runtime-archive-installer.test.ts`
的 fixture 与实现用同一组参数 helper，修复前两条用例分别以
`tar: Option --force-local is not supported` 断言失败。

## 版本、平台与相关环境

- 平台：Windows 10/11（`C:\Windows\System32\tar.exe` = bsdtar 3.8.4，libarchive 3.8.4）。
- 影响面：所有把 `tar` 解析到 bsdtar 且走 `installRuntimeArchive` 的机器
  （`apps/desktop/src/main/runtimes/manager.ts:136`）。
- 不受影响：PATH 里 GNU tar（Git Bash/MSYS2）优先的环境——它们需要这个开关。

## 影响与严重度

托管运行时无法安装/更新，属于「首次运行即失败」的能力型缺陷；错误信息不含参数不被支持
的线索，人工定位成本高。严重度 P1。

## 根因证据与置信度

- 证据（高置信度）：实现注释假设「bsdtar/Unix tar 对该形态同样接受」，但 bsdtar 不支持
  `--force-local`（本机实测输出与状态码如上）；GNU tar 才需要它来避免把 `C:/…` 当成
  `host:path` 远程语法。
- 证据（高置信度）：修复后同一测试 8 通过 / 1 跳过（符号链接用例在 Windows 上跳过）。

## 修复

- `runtime-archive-installer.ts` 新增 `detectTarFlavor()`（进程内探测一次 `tar --version`）、
  `tarPathArgument()`（Windows 转正斜杠）与 `tarForceLocalArgs()`（仅 GNU tar 加
  `--force-local`）；解压参数由这三者组装。
- 测试与实现共用同一组 helper 构造 fixture，避免「测试和实现各写一套参数」再次漂移。
- 提交：`e80a16244`。

## 验证与剩余风险

- 验证：`bun run --cwd apps/desktop test src/main/runtimes/runtime-archive-installer.test.ts`
  → 8 通过 / 1 跳过（跳过项为 Windows 符号链接用例，与本次无关）。
- 剩余风险：探测以 `tar --version` 文本为依据；实现版本既不报 GNU 也不报 bsdtar 时按
  「不加开关」处理（对 POSIX 与 Windows 默认 tar 均正确，只是 GNU tar + 盘符路径的组合
  会退化成原来的远程误判）；该组合若出现，报错信息里仍会保留 tar 的原始 stderr。
- 未验证：打包版在真实 Windows 用户机上安装托管运行时的端到端流程（需要发布产物与
  网络下载，属发布流水线验收范围）。
