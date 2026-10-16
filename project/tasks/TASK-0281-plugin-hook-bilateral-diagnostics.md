---
id: TASK-0281
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: BUG-0124
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0124]
execution: serial
branch: main
worktree: 未拆出（串行小改，main 直接实施）
base_commit: 19dfbc762
read_paths: [apps/desktop/src/main/ipc/session.ts, apps/desktop/src/main/plugins/coding-agent-hook-registry.ts, apps/desktop/src/main/plugins/plugin-agent-contribution-service.ts, apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.ts, apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.ts]
write_paths: [apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.ts, apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.test.ts, apps/desktop/src/main/plugins/plugin-agent-contribution-service.ts, apps/desktop/src/main/ipc/session.ts, apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.ts, apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.hook-diagnostics.test.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0281-plugin-hook-bilateral-diagnostics.md]
exclusive_paths: [apps/desktop/src/main/plugins/plugin-tool-renderer-host-lifecycle.ts, apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-bridge.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 插件 Hook 派发的双侧结构化取证（零行为变更）

## 目标

让 hook 派发的两侧都留下可对照的结构化记录，用来一次区分「渲染端被重置」与「generation 抖动」：主进程记身份 + lease 诊断 + 渲染端可用性，渲染端未命中时记本地表规模与该 pluginId 下已知键。**本轮只加测点，不改派发/守卫/回复行为**（BUG-0124 待调查）。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 可并行 Task：无（`session.ts` 与插件运行时域串行）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：`main`
- Worktree：未拆出
- 集成负责人：本轮执行者
- 集成顺序：本 Task 单独落地，main 串行

### 做

- `plugin-tool-renderer-host-lifecycle.ts`：导出状态类型并新增只读 `readState()`。
- `plugin-agent-contribution-service.ts`：新增只读 `readHookLeaseDiagnostics()`（透传 registry 的 `readLeaseDiagnostics`）。
- `main/ipc/session.ts`：hook invoker 派发前记录 `{pluginId, hookId, handlerId, activationId, rejection, rendererHostState, retiredGenerations, activeLeases, sessionId}`；`finish` 的渲染端错误分支记录结构化失败（含 handlerId/activationId，此前丢失）。
- `renderer/.../plugin-host-bridge.ts`：未命中分支记录 `{pluginId, handlerId, activationId, hookId, handlerCount, knownForPlugin, knownKeyPrefixes}`；回复载荷保持原纯文本不变。
- 测试：渲染端未命中诊断用例；渲染端可用性状态读取用例。
- `.github/release-notes/v0.1.3.md` 补一条内部改动。

### 不做

- 不让 hook 调用点消费渲染端可用性 lease（那是修复，会改变行为：渲染端不可用时直接拒绝派发——待证据落地后另立切片）。
- 不改渲染端回复载荷形状（仍是 `{ error: string }`）、不加错误码、不上自愈、不做渲染端重载复位。
- 不改 registry 的 generation/lease 语义与 `readInvocationRejection` 判定。
- 不提高任何日志级别为 warn/error（除渲染端未命中诊断本身，它对应一个真实异常）。

## Given / When / Then

- Given：主进程按 hook 派发一次调用。
- When：派发发生。
- Then：主进程日志出现一条结构化记录，含 pluginId/hookId/handlerId/activationId、lease 诊断与渲染端可用性状态。

- Given：渲染端收到 hook 请求但其注册表没有该键。
- When：查表未命中。
- Then：渲染端输出结构化诊断（表规模 + 该 pluginId 下已知键），并仍按原样回复同一纯文本错误。

## 必须保持

- hook 派发、拒绝、回复与超时的行为语义完全不变（仅新增日志）。
- 渲染端未命中回复的文本与形状不变。
- 不记录凭据、会话正文或用户隐私内容；只记宿主生成的 id 与状态。

## 测试与验证

- 定向测试：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/plugins/runtime/plugin-host-bridge.hook-diagnostics.test.ts src/main/plugins/plugin-tool-renderer-host-lifecycle.test.ts`（包内）。
- 用户流程：启用带 hook 的插件 → 触发派发 → 观察 main/render 两侧是否出现可对照的结构化记录。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check:quick`，完成后 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行；与 frontmatter `integration_status` 一致。
- 人工功能验收：待验收（需 dev HMR / reload 场景复现陈旧派发）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：启用带 hook 的插件，会话进入活动 Turn。
- 操作步骤或 AI 任务输入：让渲染端重载（dev 下 HMR 或 reload），随后继续触发 hook。
- 预期行为与最终产物：main 日志出现 `hook dispatch` 结构化记录，render 日志出现 `hook handler miss` 结构化诊断，两者 handlerId/activationId 可直接对照。
- 不通过表现与已知限制：仍是纯文本错误、缺少任一侧证据。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：
  - `main/plugins/plugin-tool-renderer-host-lifecycle.ts`：导出 `PluginToolRendererHostState`，新增只读 `readState()`。
  - `main/plugins/plugin-agent-contribution-service.ts`：新增只读 `readHookLeaseDiagnostics()`（透传 registry 的 `readLeaseDiagnostics`）。
  - `main/ipc/session.ts`：hook invoker 派发前记 `hook dispatch` 结构化日志（pluginId/hookId/handlerId/activationId/sessionId/rejection/rendererHostState/retiredGenerations/activeLeases）；`finish` 的错误分支改为先记 `hook handler reported failure`（补回 handlerId/activationId）再以同一 message reject。
  - `renderer/domains/plugins/runtime/plugin-host-bridge.ts`：未命中分支记 `hook handler miss` 结构化诊断（表规模 + 该 pluginId 已知键前缀）；`respondAgentHook` 载荷与文案保持不变。
  - 测试：`plugin-host-bridge.hook-diagnostics.test.ts`（新增，1 例：未命中诊断 + 回复载荷不变）、`plugin-tool-renderer-host-lifecycle.test.ts`（增 1 例 `readState`）。
  - `.github/release-notes/v0.1.3.md`：`## 其他` 新增一条内部改动。
- 实际运行：
  - 包内 `bun ../../scripts/quality/run-vitest.mjs --run <两个测试文件>`：2 文件 / 4 例全绿。
  - `bun run --cwd apps/desktop typecheck:incremental`：通过（首轮测试夹具 hook 返回值类型不符，已改为 `undefined`）。
  - `bun run test:impact -- <四个改动文件>`：85 文件 / 459 例通过、4 跳过；2 个收集期失败（`desktop-conversation-service.test.ts`、`cli-runtime-canary.test.ts`）为 BUG-0107 存量红（`process.resourcesPath` 未定义，0 用例执行），与本次改动无关。
- 未运行及原因：`verify:ui:*` 未获授权；dev HMR / reload 场景复现交人工验收。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：
  - 只加取证、未修不对称（hook 调用点仍不消费渲染端可用性 lease）——陈旧派发仍会发生，仅变得可归因（符合 BUG-0124 本轮范围）。
  - hook 调用点无 turnId 可取，改记 `sessionId`；generation 级信息用聚合 lease 诊断（retired 数/active lease 数）近似。
  - `hook dispatch` 为 debug 级、每次派发一条，长流水下日志量随派发次数线性增长（与既有 `pluginLog.debug` 同口径）。
