---
id: TASK-0304
type: task
status: done
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0129
related_requirement: []
related_plan: []
related_tasks: [TASK-0305]
related_issues: []
related_bugs: [BUG-0129]
execution: serial
branch: main
worktree:
base_commit: a57b2bb18
read_paths:
  - apps/desktop/package.json
  - packages/remote-desktop/package.json
  - bun.lock
  - apps/desktop/src
write_paths:
  - apps/desktop/package.json
  - packages/remote-desktop/package.json
  - bun.lock
exclusive_paths:
  - apps/desktop/package.json
  - packages/remote-desktop/package.json
  - bun.lock
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端 Electron 升级 39.8.10 → 41.10.7（闭合 8 条 high 告警）

## 目标

`apps/desktop` 与 `packages/remote-desktop` 的 `electron` 从 `39.8.10` 升至 `41.10.7`（41 线最新补丁，覆盖 GHSA-hq2x-r82h-9wj4 / GHSA-gr2m-v5gq-v685 / GHSA-j84w-jfhq-vhvj / GHSA-9qh4-3jw8-366w 要求的 `41.10.4`/`41.10.6` 基线），保持既有类型与测试合同。

## 范围

### 并发评估

- 结论：不支持（与触碰 desktop/remote-desktop 源码的其他任务串行）
- 执行方式：serial
- 可并行 Task：TASK-0305（engine lockfile，无路径交集）
- 前置依赖：无
- 冲突文件/独占路径：`apps/desktop/package.json`、`packages/remote-desktop/package.json`、`bun.lock` 及升级引出的类型适配文件
- Branch：`main`
- Worktree：主工作区（串行，不拆出）
- 集成负责人：本 Task 执行者
- 集成顺序：完成后原子提交；与 TASK-0305 各自独立提交、互不夹带

### 做

- 两个 manifest 的 `electron` 精确锁 `41.10.7`，根 `bun install` 更新 `bun.lock`；
- Electron 41 类型差异的最小适配（仅限升级必需）；
- 本机 Electron 二进制随 install/自愈脚本更新（如被需要）。

### 不做

- 不对齐 42+/44 线（TASK-0089 记录 44.x 有 Clipboard/PrintToPDF 类型合同破坏面，需单独任务）；
- 不改用户可见行为、不动 e2e 配置、不启动真实 Desktop 实例。

## Given / When / Then

- Given：Desktop 与 remote-desktop 以 Electron 39.8.10 运行主进程、预加载、渲染与 WebRTC e2e。
- When：两侧 `electron` 锁至 `41.10.7` 并完成必要的类型适配。
- Then：desktop typecheck 与 remote-desktop 包内测试零回归；`check:quick`（变更文件）与完整 `bun run check` 通过；合入默认分支后 8 条 electron 告警转 `fixed`。

## 必须保持

- 主/渲染/预加载进程 API 语义与 IPC 合同不变；
- 提交不夹带 TASK-0305 的 engine lockfile 改动，也不夹带其他会话/任务的在途修改。

## 测试与验证

- 定向测试：`bun --cwd packages/remote-desktop test`；类型适配触及源码时补跑 `bun --cwd apps/desktop test` 相关面。
- 用户流程：依赖级变更；真实桌面运行冒烟由用户后续 dev 验证承接。
- 质量检查：`bun --cwd apps/desktop typecheck`；`bun run check:quick` → 完整 `bun run check`。

## 验收分层

- 工程验证：通过——typecheck 0 错误、remote-desktop 7/7、impact desktop 5035 全过、check:quick 与完整 check 全绿（命令与结果见交付记录）。
- 技术评审：自审；升级 diff 仅两 manifest 版本行与 bun.lock 的 electron 生态重解析，无源码改动。
- 集成：`a4083d07a` 已推 `origin/dev`；经晋升 PR #14（merge commit `6c02ce2d0`）抵达 `origin/main`，8 条 electron 告警由 Dependabot 重扫转 fixed（open=0）。
- 人工功能验收：不适用（依赖声明升级；Electron 运行时行为差异超出自动验证面，用户 dev 冒烟另计）。
- 发布：未授权（未触发发版；分支晋升不属发布）。

## 功能验收包

- 入口与前置条件：本地 `main` 检出，`bun install` 完成。
- 操作步骤或 AI 任务输入：不适用（无新用户入口）。
- 预期行为与最终产物：Electron 41.10.7 下类型检查、包内测试与质量门禁全绿。
- 不通过表现与已知限制：typecheck 失败或包内测试回归即阻断；Chromium 142→146 级别差异未做真实 UI 走查。
- 验收反馈及回归案例：待回填。

## 交付记录

- 实际修改：`apps/desktop/package.json` 与 `packages/remote-desktop/package.json` 的 `electron` 39.8.10→41.10.7；`bun.lock` 重新解析到 `electron@41.10.7`（npmmirror 源）。零源码适配——41 线未触发 44 线已知的 Clipboard/PrintToPDF 类型破坏面。
- 实际运行：
  - `bun install`（145 s，两侧工作区 node_modules 的 41.10.7 二进制经 postinstall 就位）；
  - `bun --cwd apps/desktop typecheck` → 0 错误；
  - `bun --cwd packages/remote-desktop test` → 3 文件 7 例全过；
  - `bun run test:impact -- apps/desktop/package.json packages/remote-desktop/package.json` → desktop 5035 例全过 / 0 失败（remote-relay 11 例、remote-desktop 7 例亦过）；desktop 包 runner exit 1 归因 BUG-0107 四个存量收集期崩溃文件——单跑 `src/main/file-protocol.test.ts` 复现同签名 TypeError（`window-manager.ts:25` 经 `quickpanel-window.ts:9` 链，vitest 进程无 `process.resourcesPath`），机理与 electron 包版本无关；
  - `bun run check:quick` → 通过（ratchet new=0）；
  - 完整 `bun run check` → 通过（lint / types（docs、mobile、cli、root tsgo、desktop incremental）/ guards / mobile-lint 全部 exit 0）。
- 未运行及原因：`build:desktop` 全量构建与 wdio e2e（耗时且需真实桌面环境，类型与包内测试已覆盖依赖声明面）；真实 Desktop dev 冒烟（UI 验证需任务授权，交用户）。
- Worktree：主工作区串行，未拆出（无并行写需求）。
- 剩余风险：Electron 41 内置 Chromium/Node 运行时差异未做真实 UI 走查；42+/44 线对齐仍需单独任务；Dependabot 8 条 electron 告警须变更抵达默认分支（origin/main）后才转 fixed。
