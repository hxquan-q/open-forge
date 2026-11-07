---
id: TASK-0476
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0475]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e4518f208
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/shared/mcp-task.ts
  - apps/desktop/src/shared/mcp-interaction.ts
write_paths:
  - packages/host-protocol/src/domains/session-mcp-tasks.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-mcp-tasks-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/apis/session.test.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0476-session-mcp-tasks-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0475]
conflicts_with: []
integration_status: integrated
created: 2026-11-08
updated: 2026-11-08
---
<!-- Copyright The Open Forge contributors. -->

# MCP 任务与待答清单子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 9 片）

## 目标

`vetta:session:{mcp-tasks-list,mcp-tasks-cancel,mcp-tasks-clear-finished,mcp-elicitation-list-pending}` 四通道迁为 `session.*` Host 方法，renderer 签名不变，旧 handler 删除。

## 做

- `domains/session-mcp-tasks.ts` 四方法合同：`DesktopMcpTask`（10 字段 + status 五枚举）与 `DesktopMcpElicitationRequest`（form/url 判别联合，字段含校验属性全量钉定）；mcpTasksList 的 sessionId 可选。
- `host/session-mcp-tasks-domain.ts`：清单/清理走注册表、取消走执行协调器、待答清单走 elicitation broker；readonly 结果展平。desktop-host 注册第十四领域；`ipc/session.ts` 删 4 handler、4 枚举项与 1 个失效局部（mcpTaskCoordinator）；preload 4 处 `host.call`（sessionId 空省略）；host-transport union 扩 SessionMcpTasks。
- 测试：注册清单 61 → 65 与 MCP 任务域两用例（清单/取消/清理/待答透传、空标识拒绝）；preload MCP 任务用例改 Host 信封断言。

## 不做

- 不迁移 MCP_TASKS_CHANGED 推送、MCP_ELICITATION_RESPONSE（窗口闭包耦合的应答映射）与 MCP App surface 通道。

## Given / When / Then

- Given 任意任务/待答状态 / When 四方法经 Host 合同调用 / Then 结果与旧通道一致（sessionId 缺省列出全部）；空标识 → `INVALID_PARAMS`；旧 4 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 632 → 628；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-08）：如"做"所列，另含 biome 归一；`ipc/session.ts` 的 mcpTaskCoordinator 局部与 import 一并移除。
- 踩坑记录：一次注释替换误复制 MCP_APP_SURFACE_GET handler 造成重复注册，编译前即被 grep 发现修正；elicitation 联合的 readonly 嵌套数组（fields/options）与合同可变形状不兼容，先用 `as never` 后改为全类型化判别映射；impact 首跑启动早于最后一轮修复（文件竞态），终止作废并以最终代码重启；preload MCP 任务用例需补假 ipc `send/on` 与 HostResponse 信封。
- 实际验证：desktop 定向 52 例通过（desktop-host 44 + preload session 8）；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 632 → 628；`test:impact` 全量通过（desktop + host-protocol）；实现提交 `f3c3335a6` 后 `test:changed --base origin/dev` 通过（6348 例）并推送 `main:dev`；其 quality run 42393652717 被后续 docs 提交 `565a6a08e` 的推送在 concurrency 组中取消（非代码失败），以 `565a6a08e` 的 run 42393835326（headSha `565a6a08e`，含同一代码面 + docs-only 增量）success 为权威结论。
- 未运行与风险：MCP_TASKS_CHANGED 推送与 elicitation 应答（窗口闭包）留旧 IPC；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
