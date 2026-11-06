---
id: TASK-0453
type: task
status: verifying
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0448]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 2f76688ee
read_paths:
  - packages/action-rpc
  - packages/runtime-memory
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/agent-settings
  - apps/desktop/src/preload/apis/system.ts
  - docs/adr/0084-runtime-host-owns-agent-control-plane.md
write_paths:
  - packages/host-protocol
  - apps/desktop/src/main/host
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/ipc/host.ts
  - apps/desktop/src/main/ipc/index.ts
  - apps/desktop/src/preload/apis/system.ts
  - apps/desktop/src/preload/host-transport.ts
  - apps/desktop/package.json
  - apps/desktop/tsconfig.json
  - apps/desktop/vitest.config.ts
  - apps/desktop/README.md
  - package.json
  - tsconfig.json
  - bun.lock
  - scripts/quality/check-package-boundaries.mjs
  - scripts/quality/count-ipc-channels.mjs
  - docs/architecture/dependents.md
  - docs/adr/0152-host-protocol-boundary-and-first-party-security.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-11-06
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# host-protocol 骨架、进程内 Host 与“设置”领域试点（PLAN-0029 Phase 2.1/2.2）

## 目标

建立 Host 合同层的最小可用骨架，并以“设置”领域试点：renderer 经 preload 调用的 6 个设置 channel 改走统一的 Host 合同入口，行为不变。为 Phase 3（Host 出进程）提供可替换 transport 的落点。

## 决策（原 draft 待定项的结论）

- 新建 `packages/host-protocol`（`@vetta/host-protocol`），不扩展 `action-rpc`：`action-rpc` 是本机 HTTP 的 Action/Debug 协议（hono 服务端、手写解析），职责是外部调用者执行 Action，与 renderer↔Host 的领域合同不同；混入会把 hono 依赖带进 preload。
- 与 ADR-0084 的关系：`RuntimeHost` 仍是 Agent/Conversation 的唯一生命周期根；本包定义的是“进程边界上的请求合同”，不持有 Runtime 状态。Host 出进程时，承载 `RuntimeHost` 的进程即通过本合同对外。新增 ADR-0152 记录合同边界与安全一方化。
- 试点范围：`vetta:settings:get-server-url`、`get-site-url`、`get-model-transport`、`set-model-transport`、`get-session-interrupt-continue`、`set-session-interrupt-continue`。token 类（server token / refresh token）与 `vetta:models:*` 不在本次，前者涉及凭证需单独评审。
- 计数口径：`apps/desktop/src/main` 非测试文件中 `ipcMain.handle(` 与包装 `handle("vetta:` 的出现次数，脚本 `scripts/quality/count-ipc-channels.mjs` 只读输出，不进 check 门禁。

## 合同

- 输入 → 输出：renderer `window.vetta.settings.*` 签名不变 → preload 经 `vetta:host:request` 发送 `{ method, params }`，main 侧 Host 用 TypeBox 校验参数与结果，返回 `{ ok, result | error }` 信封，preload 解包后以 `HostProtocolError`（带 `code`）抛出。
- 做：合同包（方法定义、Host 分发、信封、直接 transport、调用器、owner 插槽注册表、增量+快照事件归约）与单测；desktop main 的设置领域实现、进程内 Host、单一 IPC 桥；preload 设置 API 切换；删除 6 个旧 handler；ADR-0152；计数脚本。
- 不做：不把 Host 移出主进程；不迁移其他领域；不改 renderer；不引入 sidecar；不为 owner 插槽预置具体 Owner。
- Given 旧 channel 下设置读写正常 / When 切到 Host 合同 / Then 6 个 getter/setter 返回值与持久化结果不变；非法 `setModelTransport`/`setSessionInterruptContinue` 参数仍被拒绝且不写入；未知方法返回 `UNKNOWN_METHOD`；能力缺失返回 `CAPABILITY_UNAVAILABLE`。
- 保留：settings.json 锁内读改写（`updateAgentSettingsDocument`）；`serverUrl` 残留清理；预设模型自动同步与 `vetta:models:*` channel；`readSettings`/`updateSettings` 导出（被 cloud/skills 使用）。
- 已知差异：非法参数的错误消息由各自 Error 文本变为合同校验消息（renderer 两处调用方只展示通用 toast 或预先过滤，不依赖消息文本）。

## 验证

- `packages/host-protocol` 单测；desktop 设置领域与 IPC 桥定向测试；既有 `model-transport-settings.test.ts`。
- `bun run test:impact -- <files>`；跨包新增按测试政策运行 `test:changed`；`bun run check`。
- 人工验收：设置页“模型传输”与“会话中断续接”的读取/切换走查，需 UI 验证授权，本次不执行。

## 交付

- 改动归属：Open-Forge-only。实际包含 host-protocol 合同包、进程内 Desktop Host、统一 IPC 桥、设置领域 6 个方法迁移及 ADR-0152；renderer 签名与设置锁内持久化保持不变。
- 本会话已执行 Host 包 11 例、Desktop 设置/transport/模型/插件合同 4 文件 15 例，均通过；根/CLI/Desktop 类型检查通过。完整 check 及质量套件的未改模块失败见 TASK-0448 的本轮评审修复记录；未宣称跨包全套或真实 UI 验收通过。
- 2026-11-06 用户明确要求提交推送，候选提交到现有 `xquan` 并推送 `origin/xquan`；本提交承载记录，集成状态仍 pending，不代表 main/dev 集成或稳定发布。
- 发布说明候选：内部建立设置领域的统一宿主协议入口，为后续宿主拆分提供合同边界。当前 0.1.4 已发布，既有正文保持只读；下一次版本准备时汇编。

## 集成补记（2026-11-07）

- 试点已随 `c25657b00` 集成本地 `main` 并推送 `origin/dev`（16d7e620f）；`integration_status` 补记为 integrated，状态置 verifying（设置页 UI 走查仍需授权，未执行）。
