---
id: TASK-0282
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0125
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0125]
execution: serial
branch: main
worktree: 未拆出（串行小改，main 直接实施）
base_commit: 1518ed946
read_paths: [packages/runtime-ssh/src/project-resource-access.ts, apps/desktop/src/main/agent-runtime/resource-runtime.ts, packages/coding-agent/src/resources/runtime/session-resource-runtime.ts, apps/desktop/src/main/agent-runtime/session-initialization-log-port.ts]
write_paths: [packages/runtime-ssh/src/project-resource-access.ts, packages/runtime-ssh/src/project-resource-access.test.ts, packages/runtime-ssh/dist/**, apps/desktop/src/main/agent-runtime/resource-runtime.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0282-remote-resource-read-observability.md]
exclusive_paths: [packages/runtime-ssh/src/project-resource-access.ts, apps/desktop/src/main/agent-runtime/resource-runtime.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 远端资源读取观测：计数与累计耗时（零行为变更）

## 目标

给会话初始化最大的耗时阶段加上远端 I/O 观测，用来判定「慢＝逐次远端读」还是「慢＝等待某共享事件」：在唯一的远端读取汇聚点统计操作次数、累计耗时与按操作分解，并在 `prompt-runtime` 阶段（`resourceSource.reload()`）边界落一条日志。**本轮只加测点，不加预算、不改路由、不提前存在性校验**（BUG-0125 待调查）。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 可并行 Task：无（横跨 `runtime-ssh` 与 desktop 装配，串行）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：`main`
- Worktree：未拆出
- 集成负责人：本轮执行者
- 集成顺序：本 Task 单独落地，main 串行

### 做

- `packages/runtime-ssh/src/project-resource-access.ts`：在四个远端分支上累计 `operations` / `totalMs` / `byOperation`，并在端口上暴露只读 `readRemoteStats()`；本机分支不计入。
- `apps/desktop/src/main/agent-runtime/resource-runtime.ts`：`createDesktopSessionResourceRuntime` 增可选 `onResourceAccess` 回调；`createDesktopPromptRuntimeSources` 捕获端口句柄，在 `await resourceSource.reload()` 之后落一条结构化日志（阶段耗时 + 远端操作数与耗时分解）。
- 测试：`project-resource-access.test.ts` 增统计用例（回环 SSH 夹具）。
- 重新构建 `@vetta/runtime-ssh` 的 dist（desktop 消费其导出）。
- `.github/release-notes/v0.1.3.md` 补一条内部改动。

### 不做

- 不给会话初始化加整体 deadline、不做提前存在性校验、不改 `resume` 路由（均为修复，待证据落地后另立切片）。
- 不缓存、不批量、不合并远端读取（只观测，不改 I/O 行为）。
- 不覆盖 `initial-system-prompt` 阶段的独立观测点：该阶段经 `refreshConfigurationResources → refreshSkillsIfChanged` 复用同一端口，累计值会包含它的读取，但本轮的落点只在 `reload()` 边界；为其余阶段补落点属后续切片。
- 不改 `ssh-transport` 的 helper/回退行为（`[ssh-helper] … using ssh exec` 既有诊断保留）。

## Given / When / Then

- Given：远程项目会话初始化执行到 `resourceSource.reload()`。
- When：`reload()` 完成。
- Then：main 日志出现一条结构化记录，含该次 reload 的阶段耗时与远端操作数、累计耗时、按操作分解。

- Given：某次读取落在本机路径。
- When：经端口读取。
- Then：不进入远端统计。

## 必须保持

- 资源读取行为、路径分发与返回形状完全不变（仅在远端分支外计时与计数）。
- 端口其余消费者（技能列表等）不受影响；`paths` 语义不变。
- 不记录凭据、文件内容或用户隐私数据；日志只含计数、耗时与操作类型。

## 测试与验证

- 定向测试：`bun ../../scripts/quality/run-vitest.mjs --run src/project-resource-access.test.ts`（`packages/runtime-ssh` 包内）。
- 用户流程：远程项目会话初始化 → 观察 main 日志出现远端读取观测记录。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check:quick`，完成后 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行；与 frontmatter `integration_status` 一致。
- 人工功能验收：待验收（需真实远端主机量测，按规则交用户执行，不主动连真实主机）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：连接一个 `ssh exec` 回退（无 helper 构建）的远端主机，打开其项目会话。
- 操作步骤或 AI 任务输入：无（自然打开会话）。
- 预期行为与最终产物：main 日志出现 reload 边界的远端读取观测记录，可与 trace 的 `prompt-runtime` 耗时对照。
- 不通过表现与已知限制：日志无可对照的读取计数；或计数包含本机读。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：
  - `packages/runtime-ssh/src/project-resource-access.ts`：新增 `RemoteResourceOperation` / `RemoteResourceAccessStats` / `ProjectResourceAccess` 类型；四个远端分支外包一层 `recordRemote` 计时计数（本机分支不计入）；端口暴露只读 `readRemoteStats()`。
  - `packages/runtime-ssh/src/index.ts`、`packages/runtime-desktop/src/index.ts`：转出新类型。
  - `apps/desktop/src/main/agent-runtime/resource-runtime.ts`：`createDesktopSessionResourceRuntime` 增可选 `onResourceAccess`（并把它从透传给核心运行时的 options 中剥离）；`createDesktopPromptRuntimeSources` 捕获端口句柄，在 `reload()` 后落 `session resources reloaded` 结构化日志（阶段耗时 + 远端操作数/耗时/按操作分解）。
  - 测试：`packages/runtime-ssh/src/project-resource-access.test.ts` 增 2 例（按操作统计、本机不计入），用替身连接以避开该文件既有的 Windows 回环平台限制。
  - `.github/release-notes/v0.1.3.md`：`## 其他` 新增一条内部改动。
- 实际运行：
  - 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/project-resource-access.test.ts`（runtime-ssh）：9 例，6 通过 / 3 失败；失败均为该文件**存量 Windows 平台红**（`ssh://host C:\…` 形态与 win32 `isAbsolute("/Users/…")` 语义），与本改动无关；新增 2 例通过。
  - `bun run --cwd packages/runtime-ssh build`、`bun run --cwd packages/runtime-desktop build`：通过（dist 不入库）。
  - `bun run --cwd apps/desktop typecheck:incremental`：通过。
  - `bun run test:impact -- <两个改动文件>`：desktop 侧 941 文件 / 5006 例通过；5 个失败文件中 4 个为 BUG-0107 存量收集期红，第 5 个（`useSessionManager.session-switch.test.ts` 的 `perfSessionSwitchComplete` 断言）在单独复跑时 12/12 全绿 ⇒ 判定为并行重型跑的偶发假红（先单跑再复跑已复核）。
  - 覆盖 resource-runtime 的 7 个测试文件单独复跑：26 通过 / 1 跳过（win32 跳过远端用例）。
- 未运行及原因：真实远端主机量测按规则交用户执行（不主动连真实主机）；`verify:ui:*` 未获授权。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：
  - 观测只落在 `reload()`（`prompt-runtime` 阶段）边界；`initial-system-prompt` 经同一端口累加但本轮未单独落点，仍是最大未知量（约占 30.7 分钟中的 18.7 分钟）——为其补落点属后续切片。
  - 只在有远端读取时才有非零值；纯本机会话记录为 0，属预期。
  - 未计数 `ssh exec` 回退次数与连接复用命中率（侦察清单中列出的其余指标），本轮聚焦最能区分的「次数 + 累计耗时」。
