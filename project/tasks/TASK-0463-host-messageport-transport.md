---
id: TASK-0463
type: task
status: done
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0453, TASK-0458, TASK-0459, TASK-0461, TASK-0462]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: a7431093e
read_paths:
  - project/research/RESEARCH-0050-host-process-transport.md
  - apps/desktop/src/main/ipc/host.ts
  - apps/desktop/src/preload/host-transport.ts
  - apps/desktop/src/main/speech-input/speech-input-service.ts
write_paths:
  - packages/host-protocol/src/port-bridge.ts
  - packages/host-protocol/src/index.ts
  - packages/host-protocol/test/port-bridge.test.ts
  - apps/desktop/src/main/ipc/host.ts
  - apps/desktop/src/main/host/host-port-bridge.ts
  - apps/desktop/src/preload/host-transport.ts
  - apps/desktop/src/preload/host-transport.test.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0463-host-messageport-transport.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0462]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# Host MessagePort transport（Phase 3 第一步：换线不搬进程）

## 目标

preload↔main 的 Host 请求通道从 `ipc.invoke(vetta:host:request)` 升级为 `MessageChannelMain` 的 MessagePort，renderer 与领域实现零改动；`ipc.invoke` 保留为引导握手与回退。为 Phase 3 第二步（`utilityProcess` 承载 dispatcher）验证 transport 缝（RESEARCH-0050 结论 1）。

## 设计（定稿）

- **引导握手**：主进程在 Host 注册后向 renderer `webContents.postMessage(HOST_PORT_CHANNEL, null, [port1])`（一次性推送；窗口重建重推）；preload 收到前请求走 `ipc.invoke` 回退，收到后切换 MessagePort。回退与 MessagePort 同一信封，语义一致。
- **关联**：MessagePort 消息带自增 `id`：`{ id, request }` / `{ id, response }`；乱序响应按 id 配对。关联逻辑进 `packages/host-protocol/src/port-bridge.ts`（transport 无关，纯 MessagePort-like 接口，供 preload 与（将来）host 进程两侧复用；不引入 Electron 依赖）。
- **主进程侧**：`host-port-bridge.ts` 把 port2 的每条消息交给 `HostDispatcher.handle`，回写 `{ id, response }`；port 关闭即拆桥（不自动重建，等下次握手）。`ipcMain.handle(HOST_REQUEST_CHANNEL)` 保持现状（回退路径）。
- **不做**：不搬 dispatcher 进程；不动领域实现与 owner 注册表；不迁移事件；不删 `vetta:host:request` channel（本阶段 IPC 计数不下降）。

## Given / When / Then

- Given Host 已注册且窗口加载 / When preload 发起 20 个既有方法调用 / Then 全部经 MessagePort 往返，结果与 `ipc.invoke` 路径逐字节一致；并发调用乱序完成仍按 id 正确配对。
- Given 端口尚未送达 / When 首个调用 / Then 走 `ipc.invoke` 回退成功；端口送达后自动切换。
- Given 端口关闭（窗口刷新前 teardown）/ When 调用 / Then 回退 `ipc.invoke`，不悬挂。

## 测试与验证

- `port-bridge` 单测（配对、乱序、关闭）；preload transport 测试补端口切换与回退分支；desktop 定向（desktop-host / host-transport / system）；`apps/desktop typecheck`；`check:quick`；`test:impact`；门禁链 + 远端 quality。

## 交付记录

- 实际修改（2026-11-07）：`packages/host-protocol/src/port-bridge.ts` 新增 `PortLike`（EventEmitter 风格最小端口合同）、`portHostTransport`（客户端：自增 id 配对、乱序安全、close 拒绝挂起请求）与 `serveHostOnPort`（服务端：畸形帧静默丢弃、handle 异常兜底 INTERNAL 信封），随 `/client` 子路径导出（不加载 typebox，供 preload 打包）与根出口；desktop 侧 `ipc/host.ts` 增拉取式握手——preload `ipc.send(HOST_PORT_REQUEST)` → 主进程 `MessageChannelMain` 每调用方独立端口对，`toPortLike` 适配 `MessagePortMain`，`vetta:host:request` invoke 保留为回退；preload `host-transport.ts` 首次调用发起握手，端口送达即切换，端口关闭回退 invoke 且本会话不再重握手。
- 失败用例先行：port-bridge 4 用例（往返/乱序配对/close 拒绝/畸形帧）与 preload 4 用例（invoke 信封/错误信封/端口切换/close 回退），RED 后转绿；`system.test.ts` 两处 fake ipc 补 `send/on`。
- 实际验证：desktop 定向 3 文件 33 例通过；`apps/desktop typecheck` 通过；`check:quick -- <7 个源文件>` 通过（Biome 格式化后复跑）；host-protocol 包 15 例通过；`test:impact` 通过（desktop 受影响 6324 通过，exit 0）。
- 行为说明：握手为拉取式（每调用方独立通道，天然多窗口）；端口失效回退 invoke 不自动重握手（避免坏端口风暴）；本阶段不删 `vetta:host:request`（IPC 计数不降，Phase 3 后续删除）。
- 未运行与风险：真实 Electron 运行时的端口行为（打包后 utilityProcess 前置验证）留待下一步；UI 走查需授权未执行。
- 人工验收：不适用（transport 内部替换，renderer API 不变）。
- 发布：不适用

- 远端 CI（2026-11-07）：首推 `c619a7adb` quality failure——根级 types 检查捕获 port-bridge 测试 mock 返回未被窄化为 HostResponse 判别联合（desktop 包 typecheck 不覆盖包测试文件，本地漏拦）。修复：mock 显式注解 `Promise<HostResponse>` 并补 envelope 类型导入；本地以 `bunx tsgo --noEmit`（根级）复验归零后重推。流程教训：凡改包内测试文件，推送前补跑根级 types。

## 完成收口（2026-11-07）

- 修复批次 `214b6cbb3` 远端 quality success（run 42328679948）；实现批次 `c619a7adb` 的类型错误已由修复批次闭合，完成标准满足，状态置 done。
