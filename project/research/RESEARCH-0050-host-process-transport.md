---
id: RESEARCH-0050
type: research
status: done
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# Host 出进程（Phase 3.1）transport 预研

## 问题

PLAN-0029 Phase 3.1 要求"transport 换 `utilityProcess` + `MessagePort`，renderer 不改，不额外打包 Node"。当前 Host（`createDesktopHost`）运行在主进程，preload 经 `ipc.invoke(vetta:host:request)` 单通道转发（ADR-0152）。本预研核对可行路径与依赖面，为下一切片定范围。

## 事实（2026-11-07，只读核对）

- **Electron 41.10.7**：`utilityProcess`、`MessageChannelMain` 稳定可用。
- **仓内先例**：`speech-input-host` 已走完整路径——`vite.main.config.ts` 的 rollup `entry` 增加 `speech-input-host.ts` 独立产物（`dist/main/speech-input-host.js`），主进程 `utilityProcess.fork(fileURL…, { serviceName, stdio })` 拉起，`registerProcessRole` 记账，**无自动重启**（会话级失败显式回报）。Host 进程可完全复用该模式，无需新构建机制。
- **当前三领域的 Electron API 依赖面**：
  - settings 域：`settings-document-store`（Node fs + proper-lockfile）+ 构建常量——**纯 Node，可直接入 Host 进程**。
  - models 域：`copyApiKey` 用 `clipboard`（主进程专属）；`testProvider/getBalance` 用 `net.fetch`（utilityProcess 内可用 Node `fetch` 等价替换）；`presets/sync.ts` 模块级 import `BrowserWindow`（用于 `presets-updated` 广播，本就未迁入合同）——**需拆 owner 或换等价实现**。
  - mcp 域：OAuth 状态读取（`mcpOAuth.hasAuth`，主进程存储）、工具目录（Node fs）——**hasAuth 依赖主进程凭据存储，天然是 owner 插槽形状**。
- **HostDispatcher/HostClient 本身零 Electron 依赖**（`packages/host-protocol` 纯 TS + typebox），transport 签名 `(request) => Promise<HostResponse>` 与进程位置无关——ADR-0152 的设计兑现于此。
- **事件**：合同面尚无事件（`presets-updated`/`models:changed` 仍走旧 IPC），Phase 3.1 不涉及；快照+增量（`stream.ts`）留待领域事件迁移。

## 结论与切片建议

1. **两步走，每步可回退**（替代一次搬进程）：
   - **TASK-0463（建议）**：先换线不搬进程——preload↔main 之间用 `MessageChannelMain` 建 MessagePort 通道承载同一信封（`ipc.invoke` 保留为引导握手与回退），renderer 与领域实现零改动。验证 MessagePort transport 缝（掉线、乱序、错误传播）与合同测试。
   - **TASK-0464（其后）**：`utilityProcess` 承载 dispatcher——新增 `host-process.ts` 入口（复用 speech-input-host 构建模式），`clipboard`/凭据存储依赖以 **owner 插槽**经主进程注入或以消息桥接（ADR-0152 第 5 条本就为此设计）；`net.fetch` 换 Node fetch。崩溃语义按 speech-input 先例：不自动重启、显式失败，新增 `HOST_UNAVAILABLE` 错误码（稳定码表只追加）。
2. **不建议**：为搬进程而把 `clipboard`/凭据读取搬进 Host 进程——违反 ADR-0152 §7"凭证只在 Host（指主进程宿主）内"的一方化边界。
3. 验收口径沿用 Phase 2：定向 + `test:impact` + typecheck + 门禁链 + 远端 quality；IPC 计数不再下降（本阶段换 transport 不删通道）。

## 参考

- `apps/desktop/src/main/speech-input/speech-input-service.ts`（fork/角色记账/无重启先例）
- `apps/desktop/vite.main.config.ts`（多入口构建）
- `packages/host-protocol/src/{host,client}.ts`（transport 无关分发与客户端）
- ADR-0152、PLAN-0029 Phase 3
