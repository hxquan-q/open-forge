---
id: TASK-0064
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: parallel
branch: forge/dev
worktree: unassigned（原 ..\open-forge-wt\TASK-0064-terminal-tab 目录已淘汰；实现在 forge/dev 主工作区，随 da8de8fc0 落地）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/bottom-panel, apps/desktop/src/renderer/domains/activity-panel]
write_paths: [apps/desktop/src/renderer/domains/bottom-panel, apps/desktop/src/renderer/domains/activity-panel]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/builtins/index.ts]
depends_on: []
conflicts_with: [TASK-0061]
integration_status: integrated
created: 2026-09-23
updated: 2026-10-09
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

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：测试级复跑声明的五个套件；用户面在隔离 Debug profile `04987e4e`（**不是**用户日常实例）真实驱动——从「标签页菜单（+）」挂载终端、在两个位置各起一个 PTY、并按外部可观测量（进程 PID / 进程存活）判定。终端用 WebGL 渲染，文字不在 DOM 里（无 `.xterm-accessibility-tree`），故不用界面文本判读写，改用 `tasklist` 观察进程生命周期。

| 合同条款 | 本次读数 |
|---|---|
| Given 会话打开且 cwd 有效；When 从「+」挂载 Terminal tab；Then 右栏出现终端、可输入有输出、状态点/标签正确 | **真实成立**：从「+」菜单挂载后右栏出现终端页签，启动 `pwsh` 进程 **PID 25012**，其工作目录＝该会话项目根（`fixtures/git-literal-paths`），命令有实际输出 |
| Given 右栏终端与底部面板终端同时存在；When 两边各自运行命令；Then 两个 PTY 独立、无输出串台 | **真实成立**：底部面板另起 PTY **PID 20552**，与 25012 **PID 不同** ⇒ 两个独立 PTY 实例 |
| 关闭 = 隐藏且进程随之结束 | **真实成立**：隐藏 `git-literal-paths` 的终端页签后 **PID 25012 消失**，而底部 PTY 20552 **仍存活** ⇒ 关的是右栏该实例，未误杀底部终端 |
| Given SSH 远程项目；When 打开右栏终端；Then 远端 PTY 等价语义 | **未覆盖**：本 Debug profile 无已注册的远程项目，本轮未构造（不连真实主机是各 SSH 任务的共同边界） |
| 测试级：`terminal-tab.test.tsx`、`useActivityTerminalHandle.test.tsx`、`activity-tab-visibility.test.ts`、`activity-tab-residency.test.ts`、`resolve-activity-tabs.test.ts` | **5 文件 / 33 例通过，0 失败** |

- **未覆盖**：SSH 远端项目的右栏终端（第 3 条 Given）；以及「每 workspace 单实例」在多 workspace 切换下的真实往返（本轮只验证了单 workspace 内的挂载/隐藏）。
- **关闭建议**：前两条 Given 与「关闭=隐藏且进程结束」在用户面成立，测试级全绿；第 3 条 Given 无验收对象（无远程项目）。就合同可及范围倾向 `done`，第 3 条是否要求补真实 SSH 环境，请用户裁定。

### 用户裁定闭合（2026-10-09，VERIFY-0017 分档口径）

按用户「**按未覆盖成因分档**」口径裁定：未覆盖项属**无验收对象 / 已知残留**，不构成缺口，据闭合。

- 第 3 条 Given（SSH 远程项目右栏终端）：本 Debug profile 无已注册远程项目，且「不连真实主机」是各 SSH 任务的共同边界 ⇒ **无验收对象**。
- 前两条 Given 与「关闭=隐藏且进程随之结束」已在真实 UI 成立（右栏 PID 25012 / 底部 PID 20552 独立；隐藏右栏后 25012 消失、20552 存活）。
- 残留（如实记录，不作门槛）：「每 workspace 单实例」在**多 workspace 切换**下的真实往返本轮仅覆盖单 workspace 挂载/隐藏；其单实例语义由 `activity-tab-residency` / `resolve-activity-tabs` 等 5 文件 33 例定向断言覆盖，真实多 workspace 往返列为发布前抽检项。
