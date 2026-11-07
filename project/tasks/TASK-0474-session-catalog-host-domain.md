---
id: TASK-0474
type: task
status: in_progress
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0473]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 95cd44045
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/runtime-core/src/contracts.ts
  - apps/desktop/src/shared/session-access.ts
write_paths:
  - packages/host-protocol/src/domains/session-catalog.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-catalog-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0474-session-catalog-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0473]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话目录子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 7 片）

## 目标

`vetta:session:{list-projects,list-sessions,list-running,list-running-cwds}` 四通道迁为 `session.*` Host 方法（TASK-0465 组 1 尾部），renderer 签名不变，旧 handler 删除。

## 做

- `domains/session-catalog.ts` 四方法合同：`DesktopSessionHistoryInfo` 形状钉定（SessionHistoryInfo 14 字段 + `access` 四布尔 + `agentMode?`）、ProjectInfo `{cwd, sessionCount}`。
- `host/session-catalog-domain.ts`：目录走 session-query-service；运行中路径聚合 runtime + agent-team 协调会话；运行中 cwd 以会话头为唯一可靠来源（路径编码不可逆，语义注释保留在实现）。desktop-host 注册第十二领域；`ipc/session.ts` 删 4 handler、4 枚举项与 1 个失效 import（listRuntimeSessionProjects）；preload 4 处 `host.call`；host-transport union 扩 SessionCatalog。
- 测试：注册清单 53 → 57 与目录域三用例（项目/历史/运行聚合、cwd 头推导与不可读丢弃、空 cwd 拒绝）。

## 不做

- 不迁移 SESSIONS_CHANGED/RUNNING_CHANGED 推送事件（事件原语另片）。

## Given / When / Then

- Given 任意目录状态 / When 四方法经 Host 合同调用 / Then 结果与旧通道一致（去重与过滤语义保留）；空 cwd → `INVALID_PARAMS`；旧 4 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 640 → 636；门禁链 + quality 过滤核实。

## 交付记录

- （实施中）
