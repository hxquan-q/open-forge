---
id: TASK-0468
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0467]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3addce091
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/runtime-core/src/runtime-host/session-ports.ts
write_paths:
  - packages/host-protocol/src/domains/session-history.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-history-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0468-session-history-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0467]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话历史分支子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 1 片）

## 目标

`vetta:session:{navigate-for-edit,switch-branch,delete-message,replace-last-user-message,fork-session}` 五通道迁为 `session.*` Host 方法（TASK-0465 组 1 尾部），renderer 签名不变，旧 handler 删除。五者均为 `(sessionId, entryId) → runtime.*` 同形薄桥接。

## 做

- `domains/session-history.ts` 五方法合同（sessionId/entryId 封闭校验；结果形状钉定 `RuntimeSessionHistoryController`：navigateForEdit `{text, cancelled}`、switchBranch `{leafId}`、deleteMessage/replaceLastUserMessage `{leafId | null}`、forkSession `{path, text}`）。
- `host/session-history-domain.ts` 薄桥接 `getSharedRuntime()`（TASK-0467 已验证的访问器模式）；desktop-host 注册第六领域；`ipc/session.ts` 删 5 handler、5 枚举项；preload 5 处 `host.call`；host-transport union 扩 SessionHistory。
- 测试先行：注册清单 25 → 30 与历史域用例（透传 + 空标识 INVALID_PARAMS）。

## 不做

- 不动 appendBranchSummary（无独立 IPC 通道）、setName/rename（耦合会话文件路径校验，另片处理）；不迁移任何事件通道。

## Given / When / Then

- Given 任意会话历史 / When 五方法经 Host 合同调用 / Then 行为与旧通道一致（分支持久化、Agent 上下文同步语义留在 RuntimeHost）；空标识 → `INVALID_PARAMS`；旧 5 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、session、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 668 → 663；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列，另含 biome 归一（合同与 domain 两文件折叠格式）；测试 mock `queueRuntime` 更名 `sharedRuntime` 并补 5 个历史方法。
- 踩坑记录：无——访问器模式沿用 TASK-0467，本次为纯同形桥接；`check:quick` 首跑仅 biome 格式拒绝，自动归一后通过。
- 实际验证：desktop 定向 2 文件 31 例通过（desktop-host 23 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` 通过；`test:impact` 全量通过（desktop + host-protocol）；`count-ipc-channels` 668 → 663；实现提交 `369804316` 后 `test:changed --base origin/dev` 通过并推送 `main:dev`，远端 quality run 42357038368（headSha `369804316`）success。
- 未运行与风险：五命令的安全写语义（Turn 互斥、分支持久化）仍在 RuntimeHost 一侧未经本片改动；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
