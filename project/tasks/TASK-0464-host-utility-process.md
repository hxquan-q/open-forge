---
id: TASK-0464
type: task
status: done
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

- 实际修改（2026-11-07）：`errors.ts` 追加稳定码 `HOST_UNAVAILABLE`；新增子进程入口 `src/main/host-process.ts`（注册 settings 域并在 `process.parentPort` 收端口后 `serveHostOnPort`）；`host/host-process-service.ts`（`createHostProcessService`：端口转发 + 子进程退出置死 + HOST_UNAVAILABLE 信封 + dispose；`settingsDomainProxy`：逐方法转信封、错误还原 HostProtocolError）；`ipc/host.ts` fork（`serviceName: vetta-host-process`，fork 失败降级静态 unavailable 服务）并把 settings 代理挂到主 dispatcher；`desktop-host.ts` 移除本地 settings 注册（models/mcp 不变）；`vite.main.config.ts` 增 `host-process` 入口。
- 测试迁移：desktop-host.test 的 settings 用例随注册位置迁入 `host-process-service.test.ts`（经内存端口对 + 真实 settings 域全链路断言：读写持久化、INVALID_PARAMS、HOST_UNAVAILABLE、dispose）；desktop-host.test 保留 models/mcp（注册清单 20 → 14）。
- 踩坑记录：内存端口对首版收发映射接反（各自投递到独立表）；子进程入口相对路径笔误；均已修正。期间一次误覆盖 `settings-domain.ts`，立即以 `git show HEAD` 恢复原文（零 diff），无数据损失。
- 实际验证：desktop 定向 4 文件 29 例通过；`apps/desktop typecheck` 0 错误；根级 `tsgo --noEmit` 0 错误；`check:quick` 通过（Biome 后复跑）；`test:impact` 通过（desktop 受影响全绿，exit 0）。
- 未运行与风险：真实 utilityProcess 运行时行为（fork、parentPort 投递、打包路径）需真实启动验证——属 UI/真实运行验证，需当前任务授权，本切片未执行；子进程崩溃后 settings 面不可用直至重启应用（无自动重启，按设计）；主进程 `createDesktopHost` 的调用方（测试）已同步。
- 人工验收：不适用（进程拓扑内部变更，renderer API 不变）。
- 发布：不适用

## 完成收口（2026-11-07）

- 批次 `5b8347d65` 已推送 `origin/dev`（门禁链绿后推送）；远端 quality run 42332033653 **success**，一次通过。完成标准满足，状态置 done。真实 utilityProcess 运行验证（需授权）与 models/mcp owner 插槽迁移为后续切片。
