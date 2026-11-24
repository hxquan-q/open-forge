---
id: BUG-0183
type: bug
status: verifying
priority: P1
owner: desktop
requirement: REQ-0033
plan: PLAN-0031
source: user-report-2026-11-11
related_requirement: [REQ-0033]
related_plan: [PLAN-0031]
related_tasks: [TASK-0482]
related_issues: []
created: 2026-11-11
updated: 2026-11-11
---
<!-- Copyright The Open Forge contributors. -->

# 开发态电脑操作后端资源路径错误

## 用户流程

- Given：Windows x64 开发环境通过 `apps/desktop` 下的 `bun run dev` 启动，标准启动流程已准备随包后端资源。
- When：用户进入「电脑操作」并开启功能。
- Then：应用应从开发资源目录加载后端并刷新窗口列表，而不是报告后端未随包。

## 实际行为

开启后显示 `backend_not_bundled`，提示开发环境需要准备随包资源。当前源码工作区中资源清单存在，但运行时开发路径与资源准备路径不一致。

## 期望行为

开发态从 `process.cwd()/resources/computer-use` 加载资源；正式安装继续从 `process.resourcesPath/computer-use` 加载。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：Windows 11 x64；用户确认通过 `apps/desktop` 下 `bun run dev` 启动。
- 失败测试/CI 用例与命令（若适用）：修复前新增的后端根路径回归测试应在旧解析语义下失败。
- CI run URL 与脱敏后的关键输出（若适用）：不适用。
- 基线对照或重跑结果：回归测试旧路径基线 1 例失败（预期目录收到 `dist/main/resources/computer-use`），改用开发 cwd 后 2/2 通过。

## 最小复现

1. 在 `apps/desktop` 目录运行 `bun run dev`。
2. 打开侧栏「电脑操作」并开启开关。
3. 观察到提示 `backend_not_bundled`，尽管准备目录为 `apps/desktop/resources/computer-use`。

## 影响

标准开发启动无法使用 Windows 电脑操作功能；正式打包路径不应受影响。

## 根因证据

`apps/desktop/scripts/prepare-computer-use.mjs` 将资源准备到 `apps/desktop/resources/computer-use`。`bun run dev` 的 Electron 子进程 cwd 是 `apps/desktop`；仓库其他开发态路径解析代码明确记录 Electron 的 `app.getAppPath()` 可能指向 `dist/main`。而电脑操作 host 用其拼接 `resources/computer-use`，导致运行时探测 `apps/desktop/dist/main/resources/computer-use`。

## 回归测试

- 定向路径解析测试：开发态 `appPath=apps/desktop/dist/main`、`cwd=apps/desktop` 时应选择 `apps/desktop/resources/computer-use`；打包态应选择 `process.resourcesPath/computer-use`。

## 修复与验证

- 修复：开发态根目录改用 `process.cwd()/resources/computer-use`；打包态仍用 `process.resourcesPath/computer-use`。
- 测试：路径选择回归 2/2；电脑操作相关测试 31/31。
- 检查：`bun run check:quick -- ...` 与 `bun run check` 通过。
- 未运行及原因：未操作用户运行中的真实 Desktop；等待用户重启 `bun run dev` 后确认实际后端连接。
