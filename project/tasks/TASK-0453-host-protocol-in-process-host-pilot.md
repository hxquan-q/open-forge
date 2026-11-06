---
id: TASK-0453
type: task
status: draft
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
base_commit:
read_paths:
  - packages/action-rpc
  - packages/runtime-desktop
  - apps/desktop/src/main/agent-runtime/composition.ts
  - apps/desktop/src/main/ipc
  - apps/desktop/src/preload
  - docs/adr/0077-agent-runtime-product-ownership.md
  - docs/adr/0084-runtime-host-lifecycle-root.md
write_paths:
  - packages
  - apps/desktop/src/main/agent-runtime
  - apps/desktop/src/preload
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# host-protocol 骨架、进程内 Host 与“设置”领域试点（PLAN-0029 Phase 2.1/2.2）

## 目标

建立 Host 合同层的最小可用骨架：TypeBox 合同按领域划分、请求/事件（增量加快照）模型、能力缺失错误、owner 插槽接口；把 `composition.ts` 包成进程内 Host + `HostClient`（transport 为直接调用），以“设置”领域试点迁移一组旧 IPC channel，行为不变。

## 待定（draft 原因）

- 扩展 `action-rpc` 还是新建 `host-protocol` 包：需先读 `action-rpc` 现有协议与消费者（coding-agent、runtime-node、desktop main 72 处引用）。
- 与 ADR-0084（`RuntimeHost` 是唯一生命周期根）的关系：Host 模块是否即 `RuntimeHost` 的进程边界外壳，需核实后决定是否需要新 ADR。
- “设置”领域实际包含的 channel 清单与 preload 消费者，需统计后确定试点范围。
- 旧 IPC channel 计数口径（`ipcMain.handle` + 包装注册）需固定为可复跑脚本。

## 做（初稿）

- 合同包骨架 + 合同测试；进程内 Host 与 HostClient；设置领域 channel 经合同调用，删除对应旧 handler。
- 旧 channel 计数脚本，记录迁移前后数值。

## 不做

- 不把 Host 移出主进程（Phase 3）；不改 renderer 的 `window.vetta` 调用签名。
- 不引入 Rust/Go sidecar。

## 验证

- 合同测试 + 受影响 desktop 测试 + `bun run test:impact`；跨包变化按测试政策运行 `test:changed`；`bun run check`。
- 设置页功能人工走查需 UI 验证授权。
