---
id: TASK-0474
type: task
status: done
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
integration_status: integrated
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

- 实际修改（2026-11-07）：如"做"所列，另含 biome 归一（3 文件格式折叠）。
- 踩坑记录：删 preload 枚举时一次编辑误用 LIST_RUNNING 文本替换 LIST_PROJECTS/LIST_SESSIONS 造成重复键，随即可见并修正（未进入任何提交）；收口提交首跑被索引校验拒绝——README 翻 done 而漏翻 frontmatter，补齐后通过；listRunningCwds 用例需在用例内覆写 getRunningSessionPaths 返回两条路径以覆盖"不可读头丢弃"分支。
- 实际验证：desktop 定向 47 例通过（desktop-host 39 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 640 → 636；`test:impact` 全量通过（desktop + host-protocol）；实现提交 `6c247190f` 后 `test:changed --base origin/dev` 通过并推送 `main:dev`，远端 quality run 42380285044（headSha `6c247190f`）success。
- 未运行与风险：SESSIONS_CHANGED/RUNNING_CHANGED 推送事件留旧 IPC；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
