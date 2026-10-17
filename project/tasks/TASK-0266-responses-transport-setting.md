---
id: TASK-0266
type: task
status: verifying
priority: P2
owner: packages/ai + apps/desktop
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream b28d4f4ee
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0263]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0266-responses-transport-setting
worktree: unassigned（Agent Worktree 已淘汰；四提交已并入 main：8c1342e01/8dde6d60f/f61ca6c52/91e1be471）
base_commit: 772d3da07
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md]
write_paths: [packages/ai/src/providers/openai-responses, packages/ai/src/providers/openai-codex, apps/desktop/src/main/ipc/settings.ts, apps/desktop/src/renderer/domains/settings, apps/desktop/src/shared/i18n/locales, project/tasks/TASK-0266-responses-transport-setting.md]
exclusive_paths: []
depends_on: [TASK-0263]
conflicts_with: [TASK-0197]
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# Responses/Codex 传输方式设置（同步上游 0.5.62 传输面）

## 目标

本仓已有 Codex WebSocket 传输（2026-08 引入）但无用户可见入口。对齐上游 `b28d4f4ee`：为 OpenAI Responses 与 Codex 提供共享 WebSocket 传输与连接复用、安全 SSE 自动回退；桌面模型设置新增「模型传输方式」（SSE / WebSocket / 自动，默认自动），配置动态接入每次模型调用。强制 WebSocket 模式不静默回退。

## 范围

### 并发评估

- 结论：条件支持；写路径含 apps/desktop settings（与在途任务不相交）与 packages/ai providers
- 执行方式：serial
- 前置依赖：TASK-0263（重试标记先行，避免同文件交叉）
- Branch：main；Worktree：不拆预期

### 做

- 上游形状：`openai-responses/websocket.ts`（共享实现，~313 行）、codex `websocket.ts` 收敛复用、adapter/request 接传输选择；桌面设置节（i18n zh/en）、`useModelTransportSettingsModel`、settings IPC/preload、atoms 接线。
- 默认自动：优先 WebSocket，握手失败且请求未开始安全回退 SSE；同一会话短时复用连接，凭证变化隔离旧连接。

### 不做

- 不动 Anthropic/其他 Provider；不引入 Responses WebSocket 网关兼容承诺（不支持 `response.create` 帧的网关走 SSE/自动，文案说明）。
- 不做 Codex 传输重构之外的请求语义变更。

## Given / When / Then

- Given：OpenAI Responses 或 Codex 供应商已配置；When：设置 → 模型配置选择传输方式并发起会话；Then：按所选方式建立流式传输，自动模式在 WS 握手失败且未开始请求时回退 SSE 并继续，下次调用生效无需重启。
- Given：强制 WebSocket 且网关不支持；When：发起请求；Then：明确报错不静默回退。

## 必须保持

- 流式事件、usage、取消、错误分类语义与 SSE 路径一致；TASK-0263 的瞬时错误重试在两种传输下等价。
- 凭据变更不复用旧连接；不打真实网关做测试（fixture/回退合同用假传输）。

## 测试与验证

- 定向：ai 包 transport/adapter 合同测试（自动回退、强制不回退、连接复用与隔离）、desktop 设置模型与 i18n。
- 质量：`bun run test:impact`、`test:changed`（ai + desktop）、批末 `bun run check`。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待验收（真实网关回合需授权）。
- 发布：未授权；交付时补发布说明。

## 功能验收包

- 入口：设置 → 模型配置 → 模型传输方式。
- 预期：三种模式行为如上；切换即生效。
- 不通过：强制 WS 静默回退、或自动模式握手失败整轮报废。

## 交付记录

- 实际修改：ai 侧 `openai-responses/websocket.ts`（新，共享连接管理）+ Codex WS 薄包装收敛 + adapter/request/simple-options 接传输；coding-agent 组合合同（`CodingAgentRuntimeHostModelSettings`）与 `withConfiguredTransport` 注入；runtime-desktop `backend-pool` 与 cli-host 会话装配接线；desktop 设置节（主进程持久化+IPC+preload+渲染层+i18n zh/en+注册锚点）。提交 `8c1342e01`（ai）、`8dde6d60f`（组合）、desktop 与 docs 切片见分支。
- 实际运行：适配器 72/72（含新增 Responses WS 5 例：URL/头/start 单发、incomplete 终态、坏帧、早关、auto 回退 SSE）；组合面 4/4（新测：transport 每调用动态读取 sse→websocket）；desktop 新测 4/4 + registry 8/8；`test:impact` ai 18 文件/246 例、组合 26 文件/89 例、runtime-desktop 1 文件/19 例全绿；desktop 设置面 impact 100 例通过（2 文件收集期失败为 BUG-0107 存量，与本批无关）；`check:guards` 除基线存量（README 行引用未入库 TASK-0260~0262，见下）外全绿，声明头 new=0。
- 台账修复：0266 改 `execution: parallel`（独立 Worktree 的合规声明）并登记 `conflicts_with: TASK-0197`（其 `project/tasks` 广域 write_paths，按 0218/0187 先例本侧登记）；0268/0269 的 depends_on/conflicts_with 移除本树不存在的 TASK-0260~0262 引用（worktree 隔离只认文件系统记录，链接保留在 related_tasks 与正文 defer 叙述）。
- 未运行及原因：真实网关回合未运行（真实 Provider 不授权），以 FakeWebSocket fixture 合同为准；完整 `bun run check` 的 project-indexes 三行红为基线存量（README 行 25-27 引用的任务文件在主树仍未提交，属 TASK-0260~0262 在途批次，非本批），其入库后自愈。
- 发布说明：`v0.1.3.md`「## 改进」补传输方式条目（随本分支 docs 提交）。
- Worktree：Agent Worktree `agent-a08b5c6d753d1337b`，分支 `task/TASK-0266-responses-transport-setting`，基线 `772d3da07`；未推送，待 Coordinator 集成。
- 剩余风险：自定义网关需支持 Responses WebSocket 协议，不支持时强制 WS 档会显式报错（文案已说明）；连接复用 TTL 5 分钟与上游口径一致，未做本机实测。
