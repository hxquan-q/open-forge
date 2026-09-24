---
id: RESEARCH-0010
type: research
status: done
priority: P1
owner: apps/desktop/packages/ai
source: user-request；vastsa/PI-Desktop 源码（commit b1a8119945ac7eef6ee743c32d0cf0b8785a3e1a，2026-09-24，发布线 0.15.x Early Preview，许可证 LGPL-3.0）
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0008]
---
<!-- Copyright The Open Forge contributors. -->

# PI-Desktop 可借鉴机制源码取证

## 问题与范围

用户给出一份针对 `vastsa/PI-Desktop`（桌面 AI coding-agent 产品，React renderer + Electron main + Rust host-core sidecar + Node agent sidecar）的六条「可借鉴机制」假设清单，要求对照**一手源码**逐条证实/证伪，并给出对 Open Forge 的移植优先级。本笔记只记录证据与判断，不改代码、不新建 Requirement/Task。

取证方式：`git clone --depth 1` 该仓库至工作区外临时目录，直接阅读 Rust（`crates/host-core`）、TypeScript（`packages/agent-runtime`/`host-runtime`/`agent-host`/`plugin-sdk`/`shared`）、Electron main（`apps/desktop/electron`）源码与 `docs/spec`、`docs/adr` 决策记录；行号锚定上述 commit。未构建未运行，动态行为以代码路径与测试文件名为准。

## 事实来源

### PI-Desktop（commit b1a8119）

| 假设 | 主要取证文件 |
| --- | --- |
| 1. 进程/安全模型 | `docs/spec/03-runtime/07-process-model.md`；`docs/adr/0003`、`0010`、`0011`；`crates/host-core/src/rpc/mod.rs`（`tools.execute` 分发 L3305 起，session 解析 L1015-1089，权限评估 L3394-3570）；`crates/host-core/src/workspace.rs`（`resolve_in_workspace` L188、`resolve_tool_path` L231、`resolve_tool_path_with_external` L264）；`crates/host-core/src/permissions.rs`（契约模式硬闸 L219、`plan_mode_allows` L148、120s deny）；`crates/host-core/src/tools/mod.rs`（Job Object/killpg 进程树杀 L56-160、`is_desktop_dispatched` L962、`builtin_tool_defs` L2709）；`crates/host-core/src/secrets.rs`（AES-256-GCM + .machine-key）；`packages/agent-runtime/src/host-client.ts`（RuntimeHost 窄接口）；`packages/agent-runtime/src/path-lock.ts`；`apps/desktop/electron/main/bootstrap/window.ts`（webPreferences L204-213） |
| 2. Desktop-as-MCP | `docs/adr/0203-local-mcp-control-plane.md`；`apps/desktop/electron/main/mcp-control.ts`（`CONTROL_OPERATION_SPECS` L190-268、`CORE_TOOL_SPECS` L290-449、blocked keys L453、token/manifest L881/902、常量 L95-110）；`apps/desktop/electron/main/bootstrap/startup.ts`（env 门控 L330-348、`desktopControl` 创建与复用 L261-270） |
| 3. 插件能力模型 | `packages/plugin-sdk/src/index.ts`（`PluginManifest.contributes` L91-146、`PluginViewContrib` L629、`PluginServiceContrib` L541、`PluginBusContrib` L548、`PLUGIN_VIEW_ICONS` 闭集）；`docs/adr/0040`（resident services + bus）、`0007`（.piplug）、`0008`（utilityProcess 隔离）、`0038`（plugin-mcp-bridge）、`0039` |
| 4. Plan/Goal 产物环 | `crates/host-core/src/plans/artifact.rs`（`publish_artifact`/`verify_artifact`/`safe_artifact_path`）；`crates/host-core/src/plans/approval.rs`（`resolve` L355-492、`abort_session` L494）；`crates/host-core/src/rpc/mod.rs`（`plans.enter/submit/resolve/claimExecution/finishExecution/abort` L2999-3297）；`crates/host-core/src/review.rs`（snapshot dir、`prepare_change` L215、`finalize_change` L438、`rollback_change` L508，MAX_SNAPSHOT_BYTES=16MiB/MAX_DIFF_BYTES=512KiB）；`packages/agent-runtime/src/mode-prompts.ts`（Plan/Goal 系统提示）；`docs/adr/0043`（被它取代的 0042 说明旧卡曾依赖 git diff） |
| 5. 流式鲁棒性 | `packages/agent-runtime/src/runtime.ts`（`SILENT_TURN_NUDGE` L749、`PROGRESS_TURN_NUDGE` L764、`claimProviderRetry` L5583、`retryPendingProviderFailure` L5738、`rerunSilentTurn` L5811、`message_start` 复用 bubble id L7190-7231、silent 判定与预算重置 L7394-7449）；`packages/agent-runtime/src/provider-retry.ts`（双轨预算常量、`createProviderRetryStream` L423、`isOpaqueBadRequest` L85、`withoutDerivedOutputLimit`/`stripOutputLimitFields` L97-119、Retry-After 解析 L188-237、idle watchdog L508 起）；`packages/agent-runtime/src/provider-transport-recovery.ts`（origin 连败重建连接池，阈值 2）；`packages/shared/src/provider-retry.ts`（`PROVIDER_RETRY_MAX_RETRIES = 10`）；`packages/agent-runtime/src/one-shot-complete.ts`（一次性补全的同型预算 L92-143） |
| 6. Agent 管理自动化 | `docs/adr/scheduled-desktop-automations.md`、`0305-scheduled-task-execution-settings.md`；`crates/host-core/src/rpc/scheduled_tools.rs`（4 个 Agent 工具定义、Agent-mode 闸、project 过滤）；`crates/host-core/src/scheduled/{automation,project,timing}.rs`；`apps/desktop/electron/main/runtime/scheduled-runner.ts`（30s 轮询、`scheduled.due`→`scheduled.run`→agentPrompt、去重 dispatches）；`apps/desktop/electron/main/ipc/scheduled-ipc.ts`；`apps/desktop/src/pages/ScheduledPage.tsx` + `src/features/scheduled/*` |

### Open Forge 现场抽查（仅确认存在性与入口，未做深读）

- `packages/ai`：`src/protocol/errors.ts`（错误已带 `retryable` + `retryAfterMs`）；`src/provider-kit/stream-errors.ts`（`EmptyProviderStreamError` retryable，但仅标记不修复）；重试逻辑散落在个别 provider（`providers/google-stream/retry.ts`、`google-gemini-cli/retry.ts`），**无跨阶段统一重试预算**。
- `packages/agent`：`src/engine/run-agent-turn.ts`（`checkpoint` Port + `maxRecoveryAttempts` + `recovery_exhausted`，L133-181）；无 silent-turn 概念、无同 bubble 复用保证。
- `packages/coding-agent`：`src/features/plan-mode/`（runtime/snapshot/tool-interceptor/tool-policy/command-policy，ADR-0123 双闸门已实现）；features 目录无 scheduler/automation 条目。
- `packages/runtime-mcp`：MCP **客户端**侧（`src/server/` 是上游 MCP server 的 supervisor/catalog），无对外控制面 server。
- `packages/action-rpc`：`client.ts`/`server.ts`/`protocol.ts`/`endpoint-file.ts`——现成的 JSON-RPC 端点基础设施。
- `packages/runtime-storage`：`src/conversation/record-schema.ts` toolResult 记录带 `details` 自由字段（可承载 review 记录）。
- `packages/plugins`：`plugin-sdk/src/manifest-schema.ts`（commands/providers/agent/styles/network/browser/agent_mode/moduleFederation）；`ui.ts` 已有 workspace view（路由级整页）/global slot/bottom-panel slot/ability detail slot/nav badge 贡献点；`service-provider.ts`（外部服务生命周期 7 态）、`jobs.ts`；**无** pub/sub 总线、无浮动 widget 面、无进程内常驻服务、无 work-panel 列内嵌视图。
- `apps/desktop`：`src/main/scheduler/`（`cron.ts`/`scheduler-service.ts`/`task-executor.ts`/`task-storage.ts`——**cron 引擎已存在，表达能力高于 pi 的 manual/hourly/daily/weekly**）；`src/main/ipc/scheduler.ts`（renderer IPC 全套）；`src/renderer/domains/scheduler/components/AutomationPage.tsx`（GUI 已存在）；`src/main/conversations/plan-review-broker.ts`；`EditDiffView.tsx`（消费 toolResult 自带的 `uiDetails.diff`，**已是持久化单次执行快照，但只有展示、没有 before 字节库与回滚**）。
- 相关 ADR：ADR-0121（`.vettapkg` 插件格式）、ADR-0123（Plan 模式正交权限轴，「计划是会话状态而不是文件」）、ADR-0084（RuntimeHost 唯一宿主）。

## 当前结论

### 逐条判定

**1. 进程/安全模型：已证实（两处细化）。** 四层拓扑与 spec 完全一致：renderer `sandbox:true + contextIsolation + nodeIntegration:false`（window.ts:205-209）；Electron main 只做编排与 IPC 扇入扇出；Rust host-core 经 stdio NDJSON JSON-RPC 独占 SQLite、工具、权限网关、Plan/Goal 产物、shell 目录、插件宿主服务、secrets；Node sidecar 跑 pi agent loop，`host-client.ts` 把宿主面收窄成 `call(method,params)` 一个 RPC（注释明言直接 spawn host-core 的旧 HostClient 已无调用方）。工具调用链 `tools.execute` 的防护纵深：① `session_id` 必须命中持久化会话否则 `SESSION_NOT_FOUND`，**`ToolsExecuteParams` 根本没有 workspace 字段**——workspace 由宿主从 session 持久 `project_path`（或 session scratch 目录、同 project-group 注册根）解析，sidecar 被 prompt injection 也无法指定根；② `resolve_in_workspace` 两层防御：先做词法 `..` 归一（不存在的父目录也无法藏匿穿越），再对最深现存祖先 canonicalize 并补回不存在的尾巴，`symlink_metadata` 探测 dangling link、上限 32 跳，Windows 还去 `\\?\` 前缀并做大小写不敏感比较，越界即 `PATH_OUTSIDE_WORKSPACE`；③ `requires_external_path_permission` 用**同一个 resolver** 判定 Read/Glob/Grep/Write/Edit 是否需要「出界许可卡」，逃逸路径绕不开权限；④ 契约模式（plan|goal）硬闸在权限评估**之前**执行，`auto` 也救不回 Write/Edit/plugin 工具；⑤ 权限卡 120s deny 超时、AllowSession 按 toolName 记 grant、审批后才占 `tool_budget` 执行配额；⑥ Bash 强校验 `expectedCommandShellId+dialect`（防提示词注入换 shell），进程树杀用 Windows Job Object / Unix `process_group(0)+killpg`。secrets 是 AES-256-GCM 加密文件库（32B `.machine-key` 0600、`sha256(secret_ref)` 文件名），**不是 OS keychain**——任何「凭据放系统钥匙串」的说法需修正。细化一：sidecar 并非物理无 fs——`project-instructions.ts`/`attachment-history.ts`/`native-pi-session.ts` 直接读写指令链、附件、pi session 文件，但各自带 `isWithinRoot+realpath` 包容校验；准确说法是「工具执行路径 100% 经宿主，sidecar 自身仅做有界直接读」。细化二：`plugin_*`/`mcp_*` 工具由 host-core 再分发回 Electron main 执行（`is_desktop_dispatched`，110s 上限）——Rust 不做插件执行环境本身。

**2. Desktop-as-MCP：已证实，且规模大于原描述。** `PI_DESKTOP_MCP_CONTROL=1`（可选 `PI_DESKTOP_MCP_PORT`，默认 37123）在 Electron main 内起 Streamable HTTP MCP server，绑 127.0.0.1（bind 后断言 loopback），协议协商 2025-06-18/2025-03-26。所有调用走 `invokeIpc` 复用已注册的 main IPC handler——外部调用与 UI 动作天然收敛。原描述漏掉的机制同样值得借鉴：持久 256-bit bearer token（`mcp-control.token` 0600）+ `mcp-control.json` 连接清单（url/token/pid/active）；Origin 仅限 loopback 主机名防 DNS rebinding；`CONTROL_OPERATION_SPECS` 给全部 ~70 个 IPC 通道打 read/write/dangerous 风险标，`CORE_TOOL_SPECS` 暴露 ~20 个 `pi_*` 命名工具 + `pi_desktop_invoke` 通用调用 + `pi_control_describe` 目录自描述；dangerous 操作强制 `confirm:true`（含 `session/configure`——它能开出 `permissionMode:auto`）；`MCP_CONTROL_BLOCKED_CHANNEL_KEYS` 排除 secrets 读写与 plugin dev 通道，`stripSecretMaterial` 从已受理参数里再剥一遍 secret 形字段；请求 2MiB/结果 512KiB/会话 32 上限；**仅 mutating 调用**经 `mcpControlRendererEvent` 推送 `pi-desktop/session/event/changed` 刷新 renderer，读操作不打扰 UI。彩蛋：同一 `desktopControl` 目录也喂给插件后台调用（`source:"plugin"` + pluginContext），一份评审过的操作目录同时服务 renderer IPC、外部 MCP、插件三方。

**3. 插件能力模型：已证实。** manifest `contributes` 覆盖：commands、agentTools（可带 `planSafeActions` 让契约模式放行指定 action，宿主执行时仍强制）、skills、agentExtensions（pi CLI 扩展合同，跑在 agent 进程内需 `agent.extension` 权限）、providers（插件可注册模型供应商进 Settings）、settings、themes/scenicThemes、mcpServers、services（≤4）、bus{publish,subscribe}、views、sessionSources、globalShortcuts；另有 fs/net 声明式策略（`fs.read/write/delete` + 域名 egress 白名单）。`ui.shape:"widget"` 产出透明无边框 floating widget（可 alwaysOnTop）；`contributes.views` 把与 `ui.panel` 相同的隔离 HTML 页嵌进宿主 work-panel 列，全局以 `<pluginId>/<id>` 寻址，图标只能选闭集 token（防插件冒充宿主 chrome）。ADR-0040：service 在插件的 `utilityProcess` 里跑，broker 统一控制 onLoad 后 start/onUnload 前 stop，崩溃按整个插件重启（退避 1-30s、≤5 次、60s 健康复位、`autoRestart:false` 可退出），服务态在插件页以 chip 渲染；bus 由 manifest 声明 publish 具体 topic/subscribe 模式，broker 路由、发布者不回环、fire-and-forget（64KiB payload/16 订阅/10s 百次），且「payload 是数据不是能力」——跨 bus 无法洗权限。与 Open Forge 对照：我方 workspace view 是路由级整页 + React Module Federation 组件，pi 是 work-panel **列内嵌**隔离页；浮动 widget、声明式常驻服务、pub/sub bus 三者我方均没有。

**4. Plan/Goal 产物环：已证实（一处修正）。** `sessions.mode ∈ {agent,plan,goal}`，plan/goal 共享 contract-mode 语义；进模式是同一 session/agent 的状态迁移（`plans.enter` RPC 记账 turnId/toolCallId）。**修正**：Plan 模式不是纯只读——`plan_mode_allows` 白名单含 `Read|Glob|Grep|Bash|BrowserPreview|new_context`，Bash 在契约模式下仍走正常权限策略（ask 出卡、auto 直放），系统提示明确「Bash 供 inspection 用」；硬闸只对 Write/Edit/plugin/mcp 等未列名工具（专属错误码 `WRITE_DISABLED_IN_PLAN` 等）。SubmitPlan/SubmitGoal 是 sidecar 侧工具 → `plans.submit` → `publish_artifact` 以 `create_new` 写 `<workspace>/.pi/{plan|goal}/<slug>-<yyyymmdd-hhmm>[-n].md`（不可变、碰撞加后缀、`PLAN_MAX_MARKDOWN_BYTES` 上限、路径逐组件查 symlink/reparse），`PlanArtifact{relative_path,sha256,size_bytes}` 存进 `plan_approvals` 行。审批（`plans.resolve`，approval.rs:355-492）：过期扫描 → session+turn+toolCall 三元组不匹配即 `PLAN_APPROVAL_STALE` → status/version 乐观并发 → **`verify_artifact` 重读文件校 sha256+size（`PLAN_ARTIFACT_HASH_MISMATCH`）** → 单事务内 `UPDATE sessions SET mode='agent',permission_mode=? WHERE mode=<kind>`（丢竞态报 `PLAN_NOT_ACTIVE`）+ `plan_approvals` 状态/版本/expires_at 三重条件 + 新 `execution_id`/`EXECUTION_QUEUED` + `PLAN_EXECUTION_ACTIVE` 单飞 + audit。拒绝/过期/中断分别落 rejected/expired/interrupted；崩溃恢复把 pending 与 queued/running 一律标 interrupted，持久 session 留在契约模式——**不残留执行权限，也不重放**。Review 卡（ADR-0043 取代依赖 git diff 的 0042）：`review::prepare_change` 在 Write/Edit 执行前把旧文件字节藏进 `<data_dir>/review-changes/<sessionId>/<snapshotId>/{before,meta.json}`（16MiB/512KiB 界），成功后 `details.review`（snapshotId、相对路径、状态、增删行数、可展开 hunks、before/after hash、可否回滚）写进 toolResult 落盘；renderer 的 InlineReviewCard 与 Review 页时间线**只从持久化消息推导**，commit/切 workspace/重启都不失真；`review.rollback` 先比对当前文件 hash 与快照 after_hash，不符回 conflict 不动文件；fork 的转录保留 diff 证据但禁回滚。

**5. 流式鲁棒性：已证实（两处细化）。** (a) silent-turn 重跑：`message_end` 判 `!failed && !aborted && responseText 空 && 无 toolCall`——**比原描述宽**，不要求 thinking 非空，覆盖一切静默完结；仅试一次（`silentTurnRerunAttempted`），把 `SILENT_TURN_NUDGE`（`<no_output_recovery>` 块）**追加到 systemPrompt**（不是注入 user 消息），弹出尾部 assistant 消息后 `agent.continue()`；原 bubble 保持 streaming、重跑的 `message_start` 复用同一 `currentAssistant.id`（“one bubble, no empty row”），turn_end/agent_end 被 `suppressSilentTurnRunEnd` 压制；再静默则落 `EMPTY_MODEL_RESPONSE`（retriable:true，给 UI 继续入口）；`allowSilentCompletion` 豁免完成通知类回复。(b) 双轨共享预算：`claimProviderRetry`（runtime.ts:5583）持有 `providerRateLimitRetryAttempt` 与 `providerTransientRetryAttempt` 两条独立计数，各封顶 `PROVIDER_RETRY_MAX_RETRIES=10`；**两条预算都跨 request/stream 两相共享**（注释明言不得因换相倍增或重置）；429 延迟按 `retry-after-ms` > `Retry-After` 秒 > HTTP-date > 2s×2^n+25% jitter（30s 封顶），transient 走服务器声明优先否则 1/2/4/8s（8s 封顶）；`onRetry` → `setAgentActivity({phase:"retrying",attempt,retryDelayMs,error})` 是轻量活动态不是消息行，重试消息复用同 bubble id；**仅在完整成功响应时清零两预算**（部分输出/收到 headers 不算）；`infiniteProviderRetry` 持久化 opt-in 可放开上限；`withStreamIdleTimeout` 180s 零事件看门狗把流掐成 `STREAM_FAILED` 并入 transient 预算，配套的 `stallAbort` 会杀死被放弃的旧请求避免一次回答两次计费；同 origin 连续两次无应答失败触发 undici dispatcher 重建（阈值 2，DNS 不触发）。(c) 400/422 修复：**窄触发**——仅当 `PROVIDER_ERROR && !retriable && status∈{400,422} && message 匹配 "(no body)"`，一次修复尝试（`limitRepairTried`）用 `withoutDerivedOutputLimit` 经 `onPayload` 剥掉 `max_tokens|max_completion_tokens|max_output_tokens`，**不消耗共享预算**，第二次同类失败原样上报。相邻可借鉴项原清单未列：`PROGRESS_TURN_NUDGE`（自主执行中「只叙述进度不交工具」也重跑一次）、`PathMutex`（父 agent 与 subagent 同路径变更串行化）、tool-call 去重、inflight-checkpoint（1.5s 节流的崩溃可恢复流式落盘 → aborted 行）。

**6. Agent 管理自动化：已证实。** `ScheduledTask{List,Create,Update,Delete}` 注入 `tools.list`：List 为 low risk 直放，增删改为 medium 走正常审批；强制 Agent 模式（`TOOL_DISABLED_IN_PLAN`）；**以调用 session 的持久 project_path 圈定作用域**——list 只回本项目任务，改/删命中不到本项目任务即 `NOT_FOUND`，前台切项目不会让后台会话改错目标；字段界：title≤80/prompt≤64000/cadence∈{manual,hourly,daily,weekly}/schedule{hour,minute,weekday,weekdays?}。调度计算、持久化、重复准入、重启恢复在 Rust host；Electron `createScheduledRunner` 每 30s `scheduled.due` 轮询 → `scheduledExecute` IPC → `scheduled.run` 领 {sessionId,prompt,runId} → 复用 `agentPrompt` 通道派发 turn，失败回写 `scheduled.finishRun(SCHEDULE_DISPATCH_FAILED)`；逾期 >90s 跳过不补跑、重叠 occurrence 抑制、孤儿 run 启动即中断；任务存自己的 permissionMode（默认 Ask，Auto 是逐任务显式选择）与 provider/model。GUI：`ScheduledPage` + `features/scheduled/*`（任务/运行历史双视图、编辑、暂停恢复、Run now、会话链接），footer 时钟入口 + 全局搜索；UI 只给 09/14/19/22 四个时段，Agent 工具保留任意本地时分。**对照 Open Forge：cron 调度引擎（`src/main/scheduler/`）与 `AutomationPage` GUI 已存在且表达能力更强，缺口只剩 agent 侧工具面。**

### 移植优先级（按源码证据调整）

| 优先级 | 机制 | 目标模块 | 依据 |
| --- | --- | --- | --- |
| P0 | silent-turn 重跑（nudge + 同 bubble + EMPTY_MODEL_RESPONSE） | `packages/agent`（loop 内 `checkpoint`/完结判定处），`packages/ai` 如需错误分类 | 机制自包含、无新依赖；Open Forge `checkpoint` Port 已是天然挂点；`EmptyProviderStreamError` 只标不修，正好补齐 |
| P0 | 429/transient 双轨跨相共享预算 + `retrying` 活动态 + Retry-After 兑现 + 同 bubble 复用 | `packages/ai`（统一 stream 重试适配层）、`packages/agent`（message id 复用 + activity 事件） | 我方重试散落个别 provider，缺统一预算；pi 的「预算跨 request/stream 共享、只按完整成功清零」是可直接抄的策略层 |
| P0 | 400/422 opaque 修复（剥 max_*_tokens 重试一次） | `packages/ai`（onPayload/请求组装层） | 极小改动、收益直接；注意只剥「auto 派生」的输出上限 |
| P1 | 每次执行的 review 快照 + hash 守卫回滚（解耦 git） | `packages/runtime-storage`（toolResult `details.review` + before 字节库）、`apps/desktop`（卡片、Review 历史、rollback IPC） | `uiDetails.diff` 已持久化展示 diff，缺 before 字节库与守卫回滚；pi 的 `review.rollback` hash 守卫是解决「外部 commit 后旧卡失真+不可回滚」的完整答案 |
| P1 | loopback MCP 控制面 | `apps/desktop`（mcp-control 等价物，复用 IPC handler）、协议落 `packages/runtime-mcp` 或 `packages/action-rpc` | 价值高但要先定协议面（MCP vs 自有 RACP/action-rpc）；pi 的风险标目录 + confirm 门 + token/manifest 是现成模板 |
| P2 | Agent 侧 ScheduledTask 工具 | `packages/coding-agent`（feature + 工具）、`apps/desktop`（scheduler 桥接） | 引擎+GUI 已有，只剩工具面；pi 的 project-scoped 过滤与 Agent-mode 闸直接可抄；注意我方 cron 已超集，不必退到 cadence 枚举 |
| P2 | 插件 work-panel 列内视图 / floating widget / 常驻服务 / pub-sub bus | `packages/plugins`（manifest contributes + SDK）、`apps/desktop`（panel slot 与进程模型） | 四项可拆：views 最接近现状（已有 workspace view 路由体系），widget/服务/bus 是新表面，建议各自独立立项 |
| 长期 | 特权宿主下沉（session-bound workspace 解析、`PATH_OUTSIDE_WORKSPACE` 语义、tool admission budget、进程树杀、加密 secrets 库） | 方向性：先在 TS 侧固化合同与测试（capability-runtime/权限面），再议 Rust sidecar | pi 证明该边界收益真实（prompt injection 无法指定 workspace 根）；但 Open Forge 工具链在 `runtime-node`，整面迁移是架构级变更，非单任务 |

## 被否决的方案

- **`.pi/plan/*.md` 文件产物 + hash 绑定审批**：与 ADR-0123 决策 6 直接冲突（「计划是会话状态而不是文件」，审批面板改写后回传、不落用户工程文件）。可借鉴的是「审批绑定内容快照、原子切模式、拒绝/崩溃不留残权」这组语义——落到本仓库应绑定**会话态计划内容的 hash** 与 `plan-mode` Runtime 的状态迁移，而非新文件产物。
- **照搬 pi 的契约模式工具白名单含 Bash**：ADR-0123 已选了更严的命令白名单（引号感知单遍扫描、拒绝重定向/命令替换/写参数）。pi 的「Bash 走普通权限卡」更宽松，若放宽属行为变更需用户裁决，不作为默认移植项。
- **`.piplug` 包格式或 HTML 页插件体系**：本仓库 `.vettapkg`（ADR-0121）与 Module Federation React 组件体系已定，不引第二格式；借鉴点只在 manifest 贡献面（views/services/bus/globalShortcuts/planSafeActions），不重写容器。
- **整套 RACP/agent-host 远程面**：`packages/remote-control` 已有自有远程协议，pi 的 pi-host + SSH forward + RACP 是另一套拓扑，不重复引入；loopback 控制面可借鉴其「复用同一 IPC handler」思想，但协议选型独立评估。
- **pi 的 sidecar 内 pi-session/attachment 直接 fs**：这是其 pi 生态包袱（指令链、附件内联），非借鉴点；Open Forge 保持工具路径全经 capability/权限面即可。

## 代码/测试/指标锚点

| 主题 | 锚点（PI-Desktop，commit b1a8119） |
| --- | --- |
| session-bound workspace 解析 | `crates/host-core/src/rpc/mod.rs:1015-1089`（`resolve_tool_workspace(_for_call)`：`SESSION_NOT_FOUND`、project_path、scratch、project-group roots）；`tools/mod.rs:554-579`（`ToolsExecuteParams` 无 workspace 字段） |
| 路径沙箱 | `crates/host-core/src/workspace.rs:84-278`（词法归一、deepest-ancestor canonicalize、dangling-link 跟进 ≤32 跳、`PATH_OUTSIDE_WORKSPACE`、external resolver、lexically_inside 预检） |
| 权限网关 | `crates/host-core/src/rpc/mod.rs:3394-3570`（effective PM 解析→external-path 判定→`evaluate_auto_*`→`permissions.request` 通知→120s 超时→deny/allow；`permissions.rs:148-156,195-270` 契约模式硬闸与计划安全 action 豁免） |
| 契约模式定义 | `crates/host-core/src/sessions.rs:38-40`（`is_contract_mode` = plan\|goal）；`permissions.rs:148`（`plan_mode_allows` 含 Bash） |
| Bash 防护 | `rpc/mod.rs:3311-3359,3736-3776`（`expectedCommandShellId`/dialect 校验）；`tools/mod.rs:56-160,354,2371`（Job Object / `process_group(0)`+`killpg`） |
| secrets 库 | `crates/host-core/src/secrets.rs:15-113`（AES-256-GCM、`.machine-key` 0600、`sha256(secret_ref)` 文件名、`secret_ref_for_provider*`） |
| MCP 控制面 | `apps/desktop/electron/main/mcp-control.ts:95-110`（常量）、`190-268`（风险标目录）、`290-449`（pi_* 工具）、`453-`（blocked keys）、`616`（renderer 事件）、`881/902`（token/manifest）；`bootstrap/startup.ts:261-348` |
| 插件贡献面 | `packages/plugin-sdk/src/index.ts:49-163`（manifest）、`541-552`（services/bus）、`583-642`（views + 图标闭集）、`72-90`（panel/widget shape）；`docs/adr/0040`（服务生命周期 + bus 语义与上限） |
| Plan/Goal 产物 | `crates/host-core/src/plans/artifact.rs:79-196`（`plan_directory`/`publish_artifact`/`safe_artifact_path`/`verify_artifact`）；`plans/approval.rs:355-492`（resolve 全流程事务） |
| Review 快照 | `crates/host-core/src/review.rs:19-21,147-274,438-560`（目录布局、prepare/finalize/rollback、hash 守卫、界值）；`docs/adr/0043` |
| silent-turn / 进度重跑 | `packages/agent-runtime/src/runtime.ts:749-770`（两段 nudge）、`5811-5840`（rerunSilentTurn）、`7190-7231`（同 bubble 复用）、`7394-7449`（silent 判定/预算清零/EMPTY_MODEL_RESPONSE） |
| 双轨重试预算 | `runtime.ts:5583-5616`（claim）、`5738-5801`（retryPendingProviderFailure）、`7396-7399`（成功清零）；`provider-retry.ts:18-39`（常量）、`423-505`（setup 重试包装）、`188-237`（Retry-After）、`508-`（idle watchdog）；`shared/src/provider-retry.ts:2`（=10） |
| 400/422 修复 | `provider-retry.ts:76-119`（`isOpaqueBadRequest`/`stripOutputLimitFields`/`withoutDerivedOutputLimit`）、`455-488`（limitRepairTried 单次、不占预算） |
| 调度器 | `crates/host-core/src/rpc/scheduled_tools.rs`（工具定义/Agent-mode 闸/project 过滤）；`apps/desktop/electron/main/runtime/scheduled-runner.ts`（30s tick、`scheduled.due`、dispatches 去重、execute→prompt→finishRun） |
| Open Forge 抽查 | `packages/ai/src/protocol/errors.ts`（retryable/retryAfterMs）；`packages/agent/src/engine/run-agent-turn.ts:133-181`（checkpoint+maxRecoveryAttempts）；`packages/coding-agent/src/features/plan-mode/`；`packages/runtime-storage/src/conversation/record-schema.ts:316-349`（toolResult `details`）；`apps/desktop/src/main/scheduler/`、`src/renderer/domains/scheduler/components/AutomationPage.tsx`；`packages/plugins/plugin-sdk/src/{manifest-schema.ts,ui.ts,service-provider.ts}`；ADR-0121/0123/0084 |

## 失效条件与置信度

- 结论锚定 `vastsa/PI-Desktop@b1a8119`（2026-09-24，0.15.x Early Preview）；该仓迭代极快（ADR 已超 300 篇），后续版本对上述机制的参数、文件布局或归属层调整即需复核。
- 「已证实」指源码 + ADR 层面机制存在且路径完整；未构建运行，动态行为（如看门狗与重试的真实时序）置信度为中-高，以代码与测试文件证据为准。
- spec/ADR 与代码冲突处以代码为准（例：进程模型 spec 写「restricted profile」，ADR-0053 已改 Plan 工作流；本笔记统一按现 code 描述）。
- Open Forge 侧只做存在性/入口抽查，未深读各模块现状；「缺口」判断基于入口级证据，立项前需对目标文件做正式现状核查。
- 行号会随后续 commit 漂移；函数/常量名比行号更稳定。

## 下一步触发信号

- 用户要求治理流式可靠性（空回复、429、断流、网关 5xx）→ 先落 P0 三项：silent-turn 重跑、双轨共享预算 + retrying 活动态、opaque 400/422 剥输出上限；预期改动集中在 `packages/ai` 流适配层与 `packages/agent` 完结判定/消息复用处，需先补回归测试基线。
- 用户要求 Review 卡在外部 commit 后仍可回滚/不失真 → 立项 P1 review 快照（`details.review` + before 字节库 + hash 守卫 `rollback`），顺带把 EditDiffView 的展示 diff 与快照统一事实源。
- 需要外部 agent 驱动桌面 → 先做协议选型评估（MCP vs action-rpc/RACP 风格），再按 pi 模板落风险标目录 + token + confirm 门；属架构变更，需 ADR。
- 需要「对 Agent 说每天下午 2 点跑静态检查」类自动化 → 只差 `coding-agent` 工具面 + desktop 桥接，直接按 P2 立项；勿退回 cadence 枚举，保留 cron 表达力。
- 插件系统若要「住进工作台」→ 按 views（最接近现有 workspace-view 路由）→ services/bus/widget 顺序逐项评估，每项独立 Requirement + ADR；同步复核 `plugin-sdk` manifest 贡献面扩展与 ADR-0121 的关系。
