---
id: BUG-0124
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: 用户提供的 dev 日志（desktop-app/logs 的 2026-10-14 与 2026-10-16，main/render 双侧）
related_requirement: []
related_plan: [PLAN-0020]
related_tasks: [TASK-0356]
related_issues: []
related_bugs: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 插件 Hook 处理器被主进程反复派发但渲染端已无该处理器，双方都没有定位信息

## 用户流程

- Given：已启用带 agent hook 的插件（如 allstar-coding 的 ac-fence、vetta-ui-design）。
- When：插件贡献已注册、会话进入活动 Turn，主进程按 hook 派发。
- Then：处理器在渲染端被执行；若渲染端已无该处理器，日志应能直接区分「渲染端被重置」与「generation 抖动」，且围栏失效不应只留一条 warn。

## 实际行为

- 渲染端 `plugin-host-bridge` 查表未命中即回一句纯文本 `Plugin hook handler not found: <pluginId>/<handlerId>`（`plugin-host-bridge.ts:322-327`），不含 activationId、渲染端表规模与该插件下已知键——无法判定渲染端为何没有。
- 主进程侧守卫 `main/ipc/session.ts:739-746` 只用 `readInvocationRejection` 检查 lease 是否存在，不检查渲染端实体是否已消失；派发时不记录 generation 状态、lease 数或渲染端可用性。
- 失败回到主进程后，`session.ts:749-766` 的 `finish` 把渲染端 `{ error: string }` 压成 `new Error(string)`，`coding-agent-hook-adapter.ts:114-120` 只把 message 存进 `failedRun`——`handlerId` 与 `activationId` 在日志里彻底丢失。
- 日志表现为「同一个 handlerId 被反复调用、且渲染端都没有」：10-14 共 114 次（3 个 handlerId，单个连续失败 19/39/53 次，跨 18:36→21:46）；10-16 共 7 次（6 次同一 id `493ffa64…`，10:07:37–10:12:05）。

## 期望行为

- 派发两侧都留下可对照的结构化记录：主进程记 `{pluginId, hookId, handlerId, activationId, lease 诊断, 渲染端可用性}`，渲染端未命中时记本地表规模与该 pluginId 下的已知键。
- 同一陈旧 id 的重复失败不淹没在 warn 里，可被直接归因。

## 环境与失败证据

- Open Forge 0.1.3 dev 实例（Windows 11）。
- 10-16 现场时序吻合：`render/2026-10-16.log:41,52` 显示 10:06:01 渲染端重启、10:06:11 插件重新注册，紧接着 10:07:37 起连续 6 次同一 handlerId 失败。

## 最小复现

1. 启用带 hook 的插件并在会话中触发派发。
2. 在插件贡献仍被活动 Turn 的 lease 持有期间让渲染端重载（dev 下 HMR / 手动 reload）。
3. 继续触发 hook。

## 影响

ac-fence 属于安全围栏：处理器没跑等于围栏没生效，而当前只留一条 warn 且不含定位信息；同一陈旧 id 可连续失败数十次。

## 根因证据

身份与生命周期接线（已读全）：

- 渲染端注册键 `${pluginId}:${handlerId}:${activationId ?? "legacy"}`（`plugin-handler-generation-key.ts:1-4`）；`handlerId` 每次激活随机生成（`plugin-agent-context.ts:199-207`），`activationId` 每次插件加载随机生成（`plugin-loader.ts:14-15`）。注册表存于渲染端单例 `__vettaPluginHostBridgeRuntimeState_v2`（`plugin-host-bridge-runtime-state.ts:85-98`）——**整页重载后是新空 Map**。
- 主进程用 generation + lease 保证活动 Turn 持有的旧 generation 不提前释放（`coding-agent-hook-registry.ts:30-48,97-117,170-180`）；派发前 `readInvocationRejection`（`:130-140`）只覆盖「无 lease」。
- **发现的接线不对称（高置信候选）**：hook 调用点（`session.ts:739-746`）只检查 `webContents.isDestroyed()`，不消费 `pluginToolRendererHost` 的渲染端可用性 lease；而 tool 调用点（`session.ts:720-725`）会 `pluginToolRendererHost.acquire(...)`，并在 `render-process-gone` 时 `markUnavailable()`（`session.ts:1751-1786`）。渲染端重载后注册表清空，但 hook 仍被派发。
- 主进程侧没有任何「渲染端已重载」驱动的 plugin agent contributions 复位：`main/plugins/**` 与 `ipc/plugin-contributions.ts` 中不存在 `did-finish-load` / `did-navigate` / `render-process-gone` 驱动的 `clear(pluginId)`；`clear` 只由插件卸载/重载驱动。

**待调查**：10-14 的 3 个不同 id 也可能是 dev 插件热重载与旧会话持旧 activationId 的组合；PreToolUse 超时 1 次、UserPromptSubmit 超时 2 次属「插件自身慢」，须与「缺失」分开统计。本轮只补双侧结构化取证（零行为变更），不预设唯一原因、不上自愈与复位。

## 回归测试

- 主进程：派发时按契约产出结构化字段（身份 + lease 诊断 + 渲染端可用性状态）。
- 渲染端：未命中分支产出结构化诊断（表规模 + 该 pluginId 已知键），且回复载荷仍是原纯文本错误（行为不变）。

## 修复与验证

- 修复：本轮只加双侧取证（TASK-0281）——主进程 `hook dispatch` / `hook handler reported failure`，渲染端 `hook handler miss`；派发与回复行为不变。自愈与渲染端重载复位待证据落地后另立切片。
- 测试：`plugin-host-bridge.hook-diagnostics.test.ts` 1 例、`plugin-tool-renderer-host-lifecycle.test.ts` 增 `readState` 1 例——包内 2 文件 4 例全绿。
- 检查：`bun run --cwd apps/desktop typecheck:incremental`、`bun run test:impact` 459 例通过（2 个 BUG-0107 存量收集期红）。
- 未运行及原因：`verify:ui:*` 未获授权；dev HMR/reload 复现交人工验收。
- 剩余风险：不对称（hook 调用点不消费渲染端 lease）未修，陈旧派发仍会发生但可归因。

## 2026-10-22 TASK-0356 实现与隔离回归

dispatcher统一释放callback、abort监听和document lease，覆盖发送失败/取消/迟到响应/回包前权限撤销。committed navigation、renderer gone、teardown使current+retired失效；未提交activation同时废弃，旧commit被拒绝，新document可重新激活。原registry失效回归红、staged activation迟到commit红→registry/service/dispatcher/navigation/lifecycle组合绿（首轮18，补测3文件10）。

定向与独立复审通过；候选完整check通过，组合测试最终结果见PLAN-0020。相关Task为TASK-0356，本地main原子提交绑定；仍待真实用户流程验收，未发布。
