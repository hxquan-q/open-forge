---
id: TASK-0108
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0010
source: RESEARCH-0013 M1（VS Code `lifecycle.ts` DisposableStore/DisposableMap + `FinalizationRegistry` 泄漏 tracker）
related_requirement: [REQ-0002]
related_plan: [PLAN-0010]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/, apps/desktop/src/renderer/shared/]
write_paths: [apps/desktop/src/main/, apps/desktop/src/renderer/shared/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0105, TASK-0107]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Disposable 所有权约定 + dev 泄漏 tracker

## 目标

VS Code 的全部可释放资源走 `IDisposable`/`DisposableStore`/`DisposableMap`/`MutableDisposable` 层级（`lifecycle.ts`），调试期可切 `DisposableTracker`（记构造栈）或 `GCBasedDisposableTracker`（`FinalizationRegistry` 观察未 dispose 即 GC）抓泄漏。Open Forge 现状是零散 cleanup（watcher 引用计数、worker terminate、原子 store），没有统一所有权模型与泄漏诊断开关。本任务建立**渐进式约定**而非重写：提供轻量 `Disposable`/`DisposableStore` 工具与 dev-only tracker，新写代码默认使用，旧代码按触碰节奏收敛。

## 范围

### 并发评估

- 结论：不支持并发——约定层与 TASK-0105/0107 同主进程生命周期面，且会被它们的代码引用。
- 执行方式：serial，主工作区；排在 TASK-0105/0107 之后落地更顺（后者可直接消费新约定）。
- 可并行 Task：PLAN-0011、PLAN-0012 全部。
- 前置依赖：无硬依赖；实施顺序建议在 TASK-0105/0107 之后或同协调窗口。
- 冲突文件/独占路径：主进程各 supervisor/service 文件（与 0105/0107 重叠）。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0010 阶段 C。

### 做

- 提供最小 `Disposable` 工具集（`DisposableStore`、`MutableDisposable`、`DisposableMap`、函数式 `toDisposable`），放 `apps/desktop` 共享层或 `packages/toolkit`（先看既有放置约定）；
- dev-only 泄漏 tracker：开关默认关，开时记录构造栈或用 `FinalizationRegistry` 标记「GC 了但未 dispose」的对象，进诊断输出；
- 约定文档化：哪些资源必须持Disposable（watcher、IPC 订阅、worker、timer、webview guest 挂载点），写进包级 AGENTS.md 或 `docs/`；
- 选 1-2 个既有长期持有资源处（如 watchers Map、scheduler）做示范迁移，验证形状顺手。

### 不做

- 不做全仓重写——旧代码只在被触碰时顺手迁移；
- 不引入第三方 disposable 库（自研最小实现即可，VS Code 的实现也只有几百行）；
- 不改 renderer 的 React 生命周期管理（useEffect cleanup 照旧，本约定主要管主进程与非 React 资源）。

## Given / When / Then

- Given：dev 模式启动 Desktop 且 tracker 开关打开；
- When：某资源被 GC 但未走 dispose；
- Then：诊断输出出现该资源的构造栈/标记信息，可定位泄漏点；tracker 关闭时零开销。

## 必须保持

- 工具集必须是纯增量：不破坏任何现有 cleanup 路径；
- tracker 默认关闭，生产构建可完全 tree-shake 掉；
- 与 TASK-0107 的 role 记账契约互补不冲突（一个管释放所有权，一个管进程健康）。

## 测试与验证

- 定向测试：DisposableStore/Map 语义单测（dispose 幂等、嵌套 store、deleteAndDispose）、tracker 标记/清标路径；
- 用户流程：dev 下开 tracker 跑一轮会话+文件树+调度，核对泄漏报告；
- 质量检查：`bun run check:quick`、`test:impact` 相关包。

## 交付记录

- 实际修改：
  - `packages/toolkit/src/disposable.ts`（新增）：`Disposable`/`DisposableLike`、`toDisposable`、
    `disposeIfDisposable`、`disposeAll`（聚合失败）、`DisposableStore`、`MutableDisposable`、
    `DisposableMap`（`deleteAndDispose` 先删再释放）。
  - `packages/toolkit/src/disposable-leak-tracker.ts`（新增）：`WeakMap` + `FinalizationRegistry`
    的开发期泄漏追踪（不持强引用，默认关闭时是首行返回的空操作）。
  - `packages/toolkit/src/index.ts`：导出两个模块；`packages/toolkit/package.json` 补 `test`
    脚本（此前 toolkit 的测试无法通过 `test:pkg` / `test:impact` 运行）；`packages/toolkit/AGENTS.md`
    模块边界补一行（纯机制模块，不依赖 Node/浏览器）。
  - `apps/desktop/src/main/disposable-tracking.ts`（新增）：`!app.isPackaged &&
    VETTA_DISPOSABLE_TRACKER=1` 时启用追踪，退出时把泄漏（含创建栈）写进诊断日志。
  - `apps/desktop/src/main/main.ts`：ready 路径初始化追踪、quit cleanup 打印报告（各一行）。
  - `apps/desktop/src/main/uiohook-supervisor.ts`：看门狗与重试计时器改为
    `MutableDisposable` + `toDisposable(clearTimeout)`，去掉 `handle | null` 散装清理；
    换新值即释放旧计时器（旧实现下连续 spawn 会留下两个 watchdog）。
  - `apps/desktop/AGENTS.md`：新增「Disposable 所有权约定」一节（哪些资源必须持 Disposable、
    集合语义、幂等与失败聚合、泄漏追踪开关、迁移节奏）。
  - `.github/release-notes/v0.1.1.md`：「其他」条目（内部可靠性建设）。
- 实际运行：
  - `bun run test:pkg toolkit`（13 例）与 `bun run --cwd apps/desktop test
    src/main/uiohook-supervisor.test.ts`（11 例，覆盖启动/看门狗/重试预算/停止）。
  - `bun run check:quick -- <本次改动文件>`。
- 未运行及原因：
  - 未在真实 dev 实例里开 `VETTA_DISPOSABLE_TRACKER=1` 跑一轮会话/文件树（需要长驻 Desktop
    与用户数据目录，属 `verify:ui:*` 范畴，用户未授权；追踪器本身与泄漏报告路径有单测覆盖）。
  - 未运行 `verify:ui:*`（同上）。
- 必须保持项的复核：工具集是纯增量（未改动任何既有 cleanup 路径的行为）；追踪器默认关闭，
  生产构建里 `trackDisposable`/`markDisposableDisposed` 直接返回；
  `uiohook-supervisor` 的 11 个既有测试全绿，启动/重试/停止语义未变。
- Worktree：主工作区（`branch: main`）。
- 剩余风险：
  - `FinalizationRegistry` 的回收时机不确定，报告只能提示「疑似泄漏」，不能作为精确定论；
  - 旧代码迁移是渐进的：除 `uiohook-supervisor` 外，`ipc/fs.ts` 的 watcher/计时器表、
    `plugin-dev-watch` 的子进程句柄仍是旧写法（无测试覆盖，未在本次触碰）。
