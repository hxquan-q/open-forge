---
id: BUG-0111
type: bug
status: verifying
priority: P2
owner: runtime-node / Desktop 命令端口
requirement:
plan:
source: TASK-0249 实施期静态核查（2026-10-14）
related_requirement: []
related_plan: []
related_tasks: [TASK-0249, TASK-0441]
related_issues: []
created: 2026-10-14
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 可执行文件兜底发现路径仍指向旧品牌安装位置

## 用户流程

- Given：用户在打包安装的 Desktop 上使用 PDF / OCR 类工具，且既没有设置 `VETTA_DESKTOP_EXE`，`desktop-config.json` 的 `vettaAppPath` 也未写入或已失效。
- When：agent 调用 `html_to_pdf` / `extract_text_from_pdf` / `extract_text_from_img`。
- Then：应能按安装位置兜底找到 Desktop 可执行文件并完成转换。

## 实际行为

兜底候选路径全部指向旧品牌位置，命中不了真实安装位置，最终抛 `Vetta Desktop executable not found`（`packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts:80-82`）。

## 期望行为

兜底候选覆盖真实的安装身份：Windows 安装目录为 `%LOCALAPPDATA%\Programs\OpenForge`、可执行名冻结为 `OpenForge`；macOS 的 bundle 名随品牌档案（`Open Forge.app` / `Allstr ai.app`）而可执行名仍为 `OpenForge`；Linux 包名为 `openforge`。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：仓库 `main`（HEAD `9801e62fc`）、静态核查，未在打包安装上实测。
- 失败测试/CI 用例与命令（若适用）：无既有用例覆盖兜底路径与真实安装身份的一致性。
- 基线对照或重跑结果：不适用（静态证据，见下）。

## 最小复现

1. 在打包安装的 Desktop 上删除 `desktop-config.json` 的 `vettaAppPath`（或指向不存在的路径），并确保未设置 `VETTA_DESKTOP_EXE`。
2. 让 agent 调用一次 `html_to_pdf`。
3. 观察报错为「可执行文件未找到」，而应用实际安装在候选列表之外的位置。

## 影响

PDF 转换与 OCR 类工具在缺少显式配置时不可用；错误信息把原因指向配置而非过期的候选路径，用户与维护者都会误判。**可达性未验证**：若 `vettaAppPath` 在首次启动时总会被写入，则该路径只在配置被清理/迁移后才暴露。

## 根因证据

`packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts:67-73` 硬编码候选：

```text
win32:  %LOCALAPPDATA%\Programs\Vetta\Vetta.exe ; %ProgramFiles%\Vetta\Vetta.exe
其他:   /Applications/Vetta.app/Contents/MacOS/Vetta ; /usr/local/bin/vetta-desktop
```

真实打包身份：`apps/desktop/build/installer.iss:26` 为 `DefaultDirName={localappdata}\Programs\OpenForge`；`apps/desktop/scripts/prepare-pack.js:883-885` 的 `appId=io.github.hxquanq.openforge`、`productName=desktopBrand.displayName`、`executableName=desktopBrand.executableName`（冻结为 `OpenForge`，见 `apps/desktop/src/shared/desktop-brand.json`）；Linux 包名 `openforge`（`apps/desktop/scripts/verify-linux-packages.mjs:80`）。品牌化迁移后候选未同步。

## 回归测试

已新增候选路径合同测试，按 Windows / macOS / Linux 断言顺序和实际候选值，覆盖 Open Forge 与 Allstr ai 两种 displayName 及冻结的 `OpenForge` 可执行名。测试在旧实现上 4 例失败，实现后 `vetta-desktop-command-port.test.ts` 9/9 通过。

## 修复与验证

- 修复：Windows 候选改为当前 Inno 安装目录 `Programs\\OpenForge\\OpenForge.exe`（另保留同身份 Program Files 候选）；macOS 与 Linux 分别覆盖 `/Applications/{Open Forge,Allstr ai}.app/Contents/MacOS/OpenForge` 和 `/opt/{Open Forge,Allstr ai}/OpenForge`。显式环境/配置路径优先级不变。
- 测试：旧实现红 4 例；修复后 `vetta-desktop-command-port.test.ts` 9/9 通过。`test:impact` direct 9/9；related 246 通过、10 失败（缺少 `rg`，以及 Windows 下 `/tmp` 夹具路径不存在，均与 fallback 修改无关）。
- 检查：`bun run check` 全绿。
- 未运行及原因：未启动真实已打包 Desktop；安装制品运行时可达性仍待人工验收。
