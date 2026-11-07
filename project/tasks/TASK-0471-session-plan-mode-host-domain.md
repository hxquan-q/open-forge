---
id: TASK-0471
type: task
status: verifying
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0470]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1eac2aa36
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/coding-agent/src/features/plan-mode/contracts.ts
write_paths:
  - packages/host-protocol/src/domains/session-plan-mode.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-plan-mode-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0471-session-plan-mode-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0470]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话 plan-mode 子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 4 片）

## 目标

`vetta:session:plan-mode-{get-state,set-permission-mode}` 两通道迁为 `session.*` Host 方法（TASK-0465 组 1 尾部），renderer 签名不变，旧 handler 删除；invalid permissionMode 由 TypeBox 合同校验拒绝（替代运行时 `isCodingAgentPermissionMode` 分支）。

## 做

- `domains/session-plan-mode.ts` 两方法合同：`CodingAgentPlanModeState` 形状钉定（permissionMode `"default"|"plan"`、可选 plan `{content, status 四枚举, updatedAt}`）；permissionMode 参数用枚举 literal。
- `host/session-plan-mode-domain.ts` 薄桥接 `invokeSessionExtensionSync`；desktop-host 注册第九领域；`ipc/session.ts` 删 2 handler、2 枚举项与 3 个失效 import（PERMISSION_MODE_SET/PLAN_MODE_STATE_READ/isCodingAgentPermissionMode）；preload 2 处 `host.call`；host-transport union 扩 SessionPlanMode。
- 测试：注册清单 39 → 41 与 plan-mode 域两用例（同步读写透传 + 空 sessionId/未知 mode 拒绝）。

## 不做

- 不迁移 plan-review request/response 通道（事件耦合，随事件原语设计）。

## Given / When / Then

- Given 任意 plan-mode 状态 / When 两方法经 Host 合同调用 / Then 行为与旧通道一致（同步 extension 读写）；空 sessionId 或未知 permissionMode → `INVALID_PARAMS`；旧 2 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 654 → 652；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列。
- 踩坑记录：`invokeSessionExtensionSync` mock 返回类型被初始 `"default"` 快照推断钉死，plan 分支返回需 `as never`；ipc handler 在早前 biome 归一中被折叠为单行签名，Edit 需按磁盘原文匹配。
- 实际验证：desktop 定向 38 例通过（desktop-host 30 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 654 → 652；`test:impact` 全量通过（desktop + host-protocol）。
- 未运行与风险：UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
