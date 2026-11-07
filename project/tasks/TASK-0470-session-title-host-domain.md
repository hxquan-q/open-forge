---
id: TASK-0470
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0469]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 7204295ed
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/main/conversations/conversation-ownership-guard.ts
write_paths:
  - packages/host-protocol/src/domains/session-title.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-title-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0470-session-title-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0469]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话标题与建议子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 3 片）

## 目标

`vetta:session:{rename,auto-title,next-prompt-suggestions}` 三通道迁为 `session.*` Host 方法（TASK-0465 组 1 尾部），renderer 签名不变，旧 handler 删除。语义随迁移：rename 的 `assertOrdinaryConversationPath` 所有权守卫、auto-title 的空文本对→null 与生成后 `renameSessionById` 回写、suggestions 的空 conversation→[]。

## 做

- `domains/session-title.ts` 三方法合同（sessionPath/name minLength 1；autoTitle 结果 `string | null`；suggestions 结果 `string[]`）。
- `host/session-title-domain.ts` 保留上述语义；desktop-host 注册第八领域；`ipc/session.ts` 删 3 handler、3 枚举项与 2 个失效 extension import（守卫 import 仍被 DELETE 使用，保留）；preload 3 处 `host.call`（rename void 归一）；host-transport union 扩 SessionTitle。
- 测试：注册清单 36 → 39 与标题域三用例（守卫透传、空输入短路、生成标题回写、空标识拒绝）；所有权守卫 mock。

## 不做

- 不动 DELETE（仍用守卫走旧 IPC，另片处理）；不迁移任何事件通道。

## Given / When / Then

- Given 任意会话 / When 三方法经 Host 合同调用 / Then 行为与旧通道一致（含空输入短路与所有权拒绝）；空 sessionPath/name → `INVALID_PARAMS`；旧 3 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 657 → 654；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列。
- 踩坑记录：注册清单码点排序（`autoTitle` 在 `clearGoal` 之前），首跑按字母位插入失败；`invokeSessionExtension` mock 的返回类型被首个 `true` 推断钉死，后续 string/string[] 返回需 `as never`。
- 实际验证：desktop 定向 36 例通过（desktop-host 28 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 657 → 654；`test:impact` 全量通过（desktop + host-protocol）；实现提交 `1eac2aa36` 后 `test:changed --base origin/dev` 通过并推送 `main:dev`，远端 quality run 42363373975（headSha `1eac2aa36`）success。
- 未运行与风险：UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
