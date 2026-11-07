---
id: TASK-0464
type: task
status: in_progress
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0463]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3bbf29f4c
read_paths:
  - project/research/RESEARCH-0050-host-process-transport.md
  - apps/desktop/src/main/ipc/host.ts
  - apps/desktop/src/main/speech-input/speech-input-service.ts
  - apps/desktop/vite.main.config.ts
write_paths:
  - packages/host-protocol/src/errors.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host-process.ts
  - apps/desktop/src/main/host/host-process-service.ts
  - apps/desktop/src/main/host/host-process-service.test.ts
  - apps/desktop/src/main/ipc/host.ts
  - apps/desktop/vite.main.config.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0464-host-utility-process.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0463]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# Host utilityProcess 承载（Phase 3 第二步：settings 域先行）

## 目标

把 Node 纯净的 settings 域实现移入 `utilityProcess`（`dist/main/host-process.js`），主进程以代理方法挂到同一 `HostDispatcher` 对外合同下——renderer 与既有 MessagePort/invoke transport 均不感知进程位置（RESEARCH-0050 结论 1 后半）。models/mcp 域因 `clipboard`/凭据存储/`net` 依赖留主进程，待 owner 插槽切片。

## 设计（定稿）

- **子进程入口** `src/main/host-process.ts`：仅注册 settings 域（`settings-document-store` 为纯 Node + workspace 包，rollup 可打包）；经 `process.parentPort` 用 `serveHostOnPort` 收发（utilityProcess 的 parentPort 即 MessagePortMain 形状）。
- **主进程代理** `host/host-process-service.ts`：`registerHostIpc` 时按 speech-input 先例 `utilityProcess.fork`（`serviceName: "vetta-host-process"`、角色记账、**无自动重启**），把子进程 port 适配为 transport，`dispatcher.register(SETTINGS_HOST_METHODS, proxyImplementation)`（透传信封）。主进程 `createDesktopHost()` 不再注册 settings 本地实现。
- **崩溃语义**：子进程退出 → 代理方法返回 `HOST_UNAVAILABLE`（errors.ts 追加稳定码，ADR-0152"只追加"）；主进程记录 pid/退出码，不自动重启（后续按需手动重启入口另行切片）。
- **构建**：`vite.main.config.ts` rollup `entry` 增 `host-process`（同 `speech-input-host` 模式，`@vite-ignore` fileURL 定位）。
- **不做**：不动 models/mcp 领域实现；不迁移事件；不删 `vetta:host:request`；不做热重启。

## 待实现时核实

- utilityProcess 内 `process.parentPort` 消息形状（`event.data`）与 PortLike 适配；
- 子进程入口对 `@vetta/coding-agent/config`（`getAgentDir`）的运行时解析（数据根 env 继承自 fork）。

## Given / When / Then

- Given host 子进程存活 / When 任一 settings 方法经 MessagePort 或 invoke 调用 / Then 行为与主进程实现一致（读写 settings.json 语义不变）。
- Given 子进程崩溃 / When 调用 settings 方法 / Then `HOST_UNAVAILABLE` 错误信封，models/mcp 方法不受影响；无自动重启。
- 单测：代理对成功/失败信封透传、崩溃后 HOST_UNAVAILABLE、fork 退出记账。

## 测试与验证

- host-protocol errors 追加码的单测；desktop 定向（host-process-service + desktop-host + transport）；`apps/desktop typecheck` + 根级 `tsgo --noEmit`；`check:quick`；`test:impact`；门禁链 + 远端 quality。

## 交付记录

- 待补
