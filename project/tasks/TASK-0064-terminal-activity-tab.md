---
id: TASK-0064
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: parallel
branch: task/TASK-0064-terminal-activity-tab
worktree: ..\open-forge-wt\TASK-0064-terminal-tab
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/bottom-panel, apps/desktop/src/renderer/domains/activity-panel]
write_paths: [apps/desktop/src/renderer/domains/bottom-panel, apps/desktop/src/renderer/domains/activity-panel]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/builtins/index.ts]
depends_on: []
conflicts_with: [TASK-0061]
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Terminal 右栏 tab

## 目标

Activity Panel 新增内置 `terminal` tab，复用 `TerminalSurface` 与同一 PTY/快照 IPC 服务；每 workspace 单实例；进「+」挂载池、默认不上栏；底部面板零改动。

## 范围

### 并发评估

- 结论：条件支持——目录上与 Canvas/Browser lane 不相交，仅 `builtins/index.ts` 一行注册与 TASK-0061 冲突。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0059 之后的所有 lane；与 TASK-0061 声明冲突，集成时串行落注册行。
- 前置依赖：无合同依赖；i18n key 骨架来自 TASK-0059（若先于 0059 开工则自带 key 并与 coordinator 对齐）。
- 冲突文件/独占路径：`builtins/index.ts`（与 0061 共享）。
- 集成负责人：coordinator。

### 做

- 把 `TerminalSurface` 依赖的 handle（`cwd`/`tabId`/`active`/`setMeta`/`setCloseGuard`/`bottomPanelFocusRequestAtom`）抽成窄接口；底部面板继续提供原 adapter，Activity Panel 提供新 adapter（`active` 来自 `useActivityTabActivation`，close guard 不映射——tab 关闭=隐藏，PTY 随 surface 卸载关闭）。
- `terminal` builtin tab definition：`removable`、默认不可见（经「+」池挂载）、每 workspace 单实例。
- 确认右栏实例与底部面板实例是独立 PTY，互不抢占；Agent `shell`/`bash` 工具路径不受影响。

### 不做

- 底部面板任何行为/布局改动；Terminal 功能本身零改动。
- 多实例、分屏、终端 profile 选择器（底部面板已覆盖多实例需求）。
- Release Notes（coordinator 统一写）。

## Given / When / Then

- Given：会话打开且 cwd 有效；When：用户从「+」挂载 Terminal tab；Then：右栏出现终端，可输入、有输出、状态点/标签正确，关闭=隐藏且进程随之结束。
- Given：右栏终端与底部面板终端同时存在；When：两边各自运行命令；Then：两个 PTY 独立，无输出串台或抢占。
- Given：SSH 远程项目；When：打开右栏终端；Then：与底部面板同等语义（远端 PTY），不可用时显示既有不可用态。

## 必须保持

- `TerminalSurface` 现有生命周期语义：快照保存/回放、close guard、webgl 降级、主题跟随不因宿主变化而变。
- 底部面板实例与既有行为零回归。

## 测试与验证

- 定向测试：handle 接口两个 adapter 的合同一致性；tab meta/可见性；实例独立性（双 PTY 不串台）。
- 用户流程：「+」→ Terminal→输入命令看输出→切 tab 再回来→内容仍在→关闭隐藏；底部面板回归。
- 质量检查：组件测试 + `bun run test:impact -- <files>` + `check:quick`。

## 交付记录

实现在独立 worktree `..\open-forge-wt\TASK-0064-terminal-tab`，分支 `task/TASK-0064-terminal-activity-tab`。

- 实际修改：
  - 抽出 `TerminalSurfaceHandle`；底部面板用 `useBottomPanelInstance()` adapter，右栏用 workspace 级 `activity-terminal:<workspaceId>` adapter（close guard 空操作）。
  - 内置 `terminal` tab：`initiallyVisible: false`、`removable`、`retention: warm`、order 16；默认进「+」池。
  - 默认隐藏内置 tab 的 hiddenKeys 用 `+<id>` shown 标记，兼容已有 workspace 的 hidden 列表。
  - 未改 i18n / Release Notes（key 已在 `activityPanel.tabs.terminal`；发布说明由 coordinator 写）。
- 实际运行：
  - Main tree (`bun run --cwd apps/desktop test ...`): 5 个定向文件、26 项通过；覆盖挂载/隐藏、workspace handle、右栏与底部 PTY 隔离。
  - 工作树 Desktop vitest 7 个文件 38 通过：可见性合同、handle adapter、tab 定义与「+」挂载/关闭、双 PTY 不串台、既有 resolve/residency/close-decision。
  - `check:quick`：本任务文件 Biome 干净；`check:guards` 因并行工作区 `@vetta/coding-agent/projects` 缺根 tsconfig path map 失败，与本任务无关。
- 未运行及原因：
  - worktree 内部分既有集成测试因 Vite 解析 junction 出树依赖失败；空 definitions 的 hiddenKeys 行为不变。
  - 完整 `bun run check` 未作为放行条件。
  - 未跑 `verify:ui:*`（用户未授权）。
- 剩余风险：
  - 与 TASK-0061 集成时需串行合并 `builtins/index.ts` 的 `terminal` / `canvas` 注册行。
  - Desktop manifest 仍为 `0.5.59`；首发号 `0.1.0`（ISSUE-0007）尚未切入，fork-only 发布文案不得写入继承的 Vetta Release Notes。
- 候选发布说明（切入 Open Forge 首发版本后再写入对应 `v*.md`，当前阻断）：
  - 「新增」：右侧活动面板可以从「+」挂上终端，和底部终端是两套独立进程；关掉右栏终端会结束该进程，底部终端行为不变。
