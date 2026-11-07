---
id: TASK-0475
type: task
status: verifying
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0474]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 6c247190f
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/conversations/project-session-purge.ts
write_paths:
  - packages/host-protocol/src/domains/session-lifecycle.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-lifecycle-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0475-session-lifecycle-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0474]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话生命周期控制与删除子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 8 片）

## 目标

`vetta:session:{continue,abort,delete,delete-all-for-cwd}` 四通道迁为 `session.*` Host 方法，renderer 签名不变，旧 handler 删除。`continue` 为 JS 关键字，合同映射键用 `continueSession`、方法名保持 `session.continue`。

## 做

- `domains/session-lifecycle.ts` 四方法合同：continueSession/abort/delete →Null（sessionPath 封闭校验）、deleteAllForCwd → `{deleted: Integer, failed: String[]}`。
- `host/session-lifecycle-domain.ts`：continue 清 manual-stop；abort 标记 manual-stop 并 abort+stopSessionBackgroundWork 并行收割；delete 保留所有权守卫 + ADR-0007 子目录回收 + 注解清理；deleteAllForCwd 走 purgeProjectSessions（readonly failed 展平为可变数组）。desktop-host 注册第十三领域；`ipc/session.ts` 删 4 handler、4 枚举项与 6 个失效 import（clearSessionManualStop/isConversationSubCwd 仍被 PROMPT/CLEAR_DEFAULT_CONVERSATION 使用，保留）；preload 4 处 `host.call`；host-transport union 扩 SessionLifecycle。
- 测试：注册清单 57 → 61 与生命周期域三用例（continue/abort 桥接、删除守卫透传与 cwd 清理、空标识拒绝）；stop-session-work/message-annotations/project-session-purge/logger 模块 mock。

## 不做

- 不迁移 PROMPT/CREATE（流式入口与编排复杂，另片）、SUBSCRIBE/UNSUBSCRIBE（事件原语另片）、CLEAR_DEFAULT_*（scope 编排，随后续片）。

## Given / When / Then

- Given 任意会话状态 / When 四方法经 Host 合同调用 / Then 行为与旧通道一致（abort 连带后台收割、删除失败保留目录）；空标识 → `INVALID_PARAMS`；旧 4 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 636 → 632；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列。
- 踩坑记录：枚举清理两次手误——恢复 SUBSCRIBE 时制造 SESSIONS_CHANGED 重复键、去重时又整行删掉了仍在用的 SESSIONS_CHANGED（广播用），均被 biome/tsc 立即暴露后修复；`ProjectSessionPurgeResult.failed` 是 readonly 数组，与合同可变形状不兼容，域内展平；import 收窄时 clearSessionManualStop/isConversationSubCwd 仍有 PROMPT/CLEAR_DEFAULT_CONVERSATION 调用点，需保留。
- 实际验证：desktop 定向 50 例通过（desktop-host 42 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 636 → 632；`test:impact` 首跑失败（输出被重定向丢弃无法定位），保留日志复跑全量通过（desktop 1291.9s + host-protocol）。
- 未运行与风险：PROMPT/CREATE/SUBSCRIBE 留旧 IPC；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
