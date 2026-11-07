---
id: TASK-0466
type: task
status: verifying
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: d588e647e
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - project/tasks/TASK-0465-session-stream-migration-investigation.md
write_paths:
  - packages/host-protocol/src/domains/session-defaults.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-defaults-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0466-session-defaults-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0465]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话默认项/个性化子域迁移到 Host 合同（Phase 3 领域迁移第 2 批首片）

## 目标

`vetta:session:get-global-thinking-level` / `get-personas` / `get-personalization` / `set-personalization` 四个 runtime 无关通道迁为 `session.getThinkingLevel` / `session.getPersonas` / `session.getPersonalization` / `session.setPersonalization`，renderer 签名不变，旧 handler 删除。`set-global-thinking-level`（需触达活跃会话运行时）留旧 IPC 待运行时注入形状定稿。

## 做

- `domains/session-defaults.ts` 四方法合同（personaId/customPrompt 形状钉定；成员关系由实现校验同旧口径）。
- `host/session-defaults-domain.ts` 实现（settings-document-store + `@vetta/coding-agent/profile` 注册表）；desktop-host 注册第四领域；`ipc/session.ts` 删 4 handler、4 枚举项及无用导入；preload session api 建 host client 并 4 处切换；host-transport union 扩 SessionDefaults。
- 失败用例先行：注册清单 14 → 18 与三个领域用例（thinking 默认/读取、personas 清单、personalization 读写与未知 persona 拒绝）。

## 不做

- 不迁移 runtime 耦合设置器、事件通道、审批面（见 TASK-0465 分组）。

## Given / When / Then

- Given 任意 settings 状态 / When 四方法经 Host 合同调用 / Then 行为与旧通道一致（默认 "off"、默认 persona、写盘语义）；未知 personaId → `INVALID_PARAMS`；旧 4 channel 不再注册。

## 测试与验证

- desktop 定向 4 文件；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数下降；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：`domains/session-defaults.ts` 四方法合同；`host/session-defaults-domain.ts`（settings-document-store + coding-agent/profile，personaId 成员关系按旧口径在实现层拒绝）；desktop-host 注册第四领域（清单 14 → 18）；`ipc/session.ts` 删 4 handler、4 枚举项与 2 处无用导入（PERSONAS/readSettings）；preload session api 建 host client 并 4 处 `host.call`（setPersonalization 以 await 归一 void）；host-transport union 扩 SessionDefaultsHostMethods。
- 踩坑记录：index.ts 的领域导出编辑曾被 stale-read 拦截而漏重做（测试 19 败定位后补上）；python heredoc 引号嵌套失败一次，改临时脚本完成测试注入。
- 实际验证：desktop 定向 4 文件 32 例通过；`apps/desktop typecheck` 与根 `tsgo` 均 0 错；`check:quick` 通过（清理 2 处迁移残留警告后复跑）；`test:impact` 通过（6323 通过，exit 0）；`count-ipc-channels` 679 → 675。
- 未运行与风险：runtime 耦合设置器（set-global-thinking 等）与事件/审批面仍留旧 IPC（TASK-0465 分组）；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
