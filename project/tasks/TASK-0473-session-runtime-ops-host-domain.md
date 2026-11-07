---
id: TASK-0473
type: task
status: in_progress
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0472]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: a38fdae23
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/coding-agent/src/execution/background/background-work-session-extension-contract.ts
write_paths:
  - packages/host-protocol/src/domains/session-runtime-ops.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-runtime-ops-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/apis/session.test.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0473-session-runtime-ops-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0472]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话运行控制与后台任务子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 6 片）

## 目标

`vetta:session:{retry,interrupt-draft,get-session-path,background-tasks-clear-finished,background-tasks-kill,subagent-interrupt}` 六通道迁为 `session.*` Host 方法，renderer 签名不变，旧 handler 删除。`dispose`/`subscribe` 等与生命周期/事件机制纠缠的通道不在此片。

## 做

- `domains/session-runtime-ops.ts` 六方法合同：retry/setInterruptDraftNonEmpty（nonEmpty 布尔）→Null、getSessionPath → `string | null`（preload 侧 null→undefined 保持 `Promise<string | undefined>` 签名）、clearFinishedBackgroundTasks → Number、killBackgroundTask（taskId）→ Boolean、interruptSubagent（target，快照非空归一）→ Boolean。
- `host/session-runtime-ops-domain.ts`：retry 先清 manual-stop（PROMPT/CONTINUE 仍用旧路径内的同一注册表）；desktop-host 注册第十一领域；`ipc/session.ts` 删 6 handler、6 枚举项与 4 个失效 import；preload 6 处 `host.call`；host-transport union 扩 SessionRuntimeOps。
- 测试：注册清单 47 → 53 与运行控制域三用例（retry/draft、路径与后台任务桥接含 null 归一、空标识与非布尔拒绝）；interrupt 注册表 mock 经 vi.hoisted 共享。

## 不做

- 不迁移 dispose（闭包耦合 interactive residency）、subscribe/unsubscribe（事件原语另片）、INTERRUPT_HEALTH/INTERRUPTED_STARTUP（主→renderer 推送）。

## Given / When / Then

- Given 任意会话状态 / When 六方法经 Host 合同调用 / Then 行为与旧通道一致（retry 前清 manual-stop、subagent 快照 null→false）；空标识/非布尔 nonEmpty → `INVALID_PARAMS`；旧 6 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 646 → 640；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列。
- 踩坑记录：删除 INTERRUPT_DRAFT handler 时误写无效占位行，即时改为迁移注释（未进入任何提交）；preload retry 用例需补 `send` 假 ipc 且 invoke 返回 HostResponse 信封；`getSessionPath` mock 需显式标注 `string | undefined` 以支持 null 归一用例。
- 实际验证：desktop 定向 44 例通过（desktop-host 36 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 646 → 640；`test:impact` 结果见下。
- 未运行与风险：dispose/subscribe 留旧 IPC；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
