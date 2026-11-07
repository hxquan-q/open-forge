---
id: TASK-0467
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0466]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 64ed11421
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/runtime-core/src/runtime-host/session-ports.ts
write_paths:
  - packages/host-protocol/src/domains/session-queue.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-queue-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/apis/session.test.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0467-session-queue-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0466]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话输入队列子域迁移到 Host 合同（Phase 3 领域迁移第 2 批第 2 片）

## 目标

`vetta:session:queue-state`（getter）与 queue-{context-compaction,remove,reorder,send-now,resume,clear} 七通道迁为 `session.*` Host 方法，renderer 签名不变，旧 handler 删除；`queue-state` 推送事件仍走旧 IPC（TASK-0465 事件原语前置）。

## 做

- `domains/session-queue.ts` 七方法合同（sessionId/itemId/itemIds 封闭校验；`RuntimeSessionQueueStateView`/`RuntimeSessionQueueEntryView` 形状钉定）。
- `host/session-queue-domain.ts` 薄桥接 `getSharedRuntime()`（能力全在 RuntimeHost，ADR-0060）；desktop-host 注册第五领域；`ipc/session.ts` 删 7 handler、7 枚举项；preload 7 处 `host.call`（void 归一）；host-transport union 扩 SessionQueue。
- 失败用例先行：注册清单 18 → 25 与队列域两用例（快照透传、操作桥接 + 空标识拒绝）；`session.test.ts` compaction 用例同步为 Host 信封断言。

## 不做

- 不迁移 queue-state 推送事件与 runtime 耦合设置器；不动 ADR-0060 队列能力本体。

## Given / When / Then

- Given 任意队列状态 / When 七方法经 Host 合同调用 / Then 行为与旧通道一致（含 reorder 参数校验、send-now 三值结果）；空标识 → `INVALID_PARAMS`；旧 7 channel 不再注册。

## 测试与验证

- desktop 定向 4 文件 34 例 + session.test 8 例；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数下降；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列，另含 biome 归一。`count-ipc-channels` 675 → 668（循环累计 693 → 668）。
- 踩坑记录：迁移脚本首次因相对路径未生效（无副作用）后修正执行；`session.test.ts` 假 ipc 缺 `send/on` 由 impact 首跑暴露，补全并同步信封断言。
- 实际验证：desktop 定向 4 文件 34 例通过；`session.test.ts` 8 例通过；双侧 typecheck 0 错；`check:quick` 通过；`test:impact` 首跑 1 失败（上述假 ipc）后复跑通过；实现提交 `b39984439` 后全量 `test:changed --base origin/dev` 6325 例通过并推送 `main:dev`，远端 quality run 42353639237（headSha `b39984439`）success。
- 未运行与风险：queue-state 推送事件与 runtime 耦合设置器仍留旧 IPC；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
