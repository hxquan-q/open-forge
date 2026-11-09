---
id: TASK-0472
type: task
status: done
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0465, TASK-0471]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: b3167b761
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/runtime-core/src/contracts.ts
  - apps/desktop/src/main/agent-modes/index.ts
write_paths:
  - packages/host-protocol/src/domains/session-execution.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/session-execution-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/preload/apis/session.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0472-session-execution-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0471]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话执行模式与全局设置子域迁移到 Host 合同（Phase 3 领域迁移第 3 批第 5 片）

## 目标

`vetta:session:{update-settings,set-execution-mode,set-global-execution-mode,set-global-agent-mode,set-global-thinking-level,get-agent-modes}` 六通道迁为 `session.*` Host 方法（TASK-0465 组 1 尾部），renderer 签名不变，旧 handler 删除；executionMode 二字面量由合同校验（替代本地 assertExecutionMode 调用点）。

## 做

- `domains/session-execution.ts` 六方法合同：SettingsPatch 四可选字段钉定（thinkingLevel 开放字符串沿用 session-defaults 约定）、executionMode 二字面量、agentModes 目录 `{id,label,description,icon}`。
- `host/session-execution-domain.ts`：setExecutionMode 编排（sessionPath→cwd→assertProjectSupportsExecutionMode + assertSandboxAvailableForMode）与全局设置落盘（updateDesktopConfig/updateAgentSettingsDocument）随迁移保留；AGENT_MODE_CHANGED 显示同步广播仍走旧 IPC 事件（BrowserWindow 广播为主进程副作用）；依赖取自 canonical 模块（config/desktop-config-store、agent-settings/settings-document-store），不经 ipc/ 转发。
- desktop-host 注册第十领域；`ipc/session.ts` 删 6 handler、6 枚举项、resolveDefaultExecutionMode 闭包与 7 个失效 import；preload 6 处 `host.call`（void 归一）；host-transport union 扩 SessionExecution。
- 测试：注册清单 41 → 47 与执行域三用例（patch 透传与目录、编排断言与落盘、非法 mode 拒绝）；electron stub 的 BrowserWindow.getAllWindows 返回空使广播为 no-op。

## 不做

- 不迁移 AGENT_MODE_CHANGED / SESSIONS_CHANGED 等事件通道（事件原语另片）；不动 CREATE 内 assertExecutionMode（创建路径未迁移）。

## Given / When / Then

- Given 任意配置 / When 六方法经 Host 合同调用 / Then 行为与旧通道一致（sandbox 可用断言失败仍抛出、全局设置落盘、广播照发）；非法 executionMode → `INVALID_PARAMS`；旧 6 channel 不再注册。

## 测试与验证

- desktop 定向（desktop-host、preload session）；`apps/desktop typecheck` + 根 `tsgo`；`check:quick`；`test:impact`；IPC 计数 652 → 646；门禁链 + quality 过滤核实。

## 交付记录

- 实际修改（2026-11-07）：如"做"所列，另含 `agent-mode-ipc.test.ts` 源码钉死断言改指向 host/session-execution-domain.ts（原断言 handler 在 ipc/session.ts 内，随迁移改锚点；切片取 setGlobalAgentMode 起点到文件末尾以覆盖广播辅助函数）。
- 踩坑记录：impact 首跑暴露上述源码钉死测试（2 例失败，其余 6335 例通过）——handler 位置即被测结构，迁移必须同步改锚点；host 域依赖须取 canonical 模块（config/desktop-config-store、agent-settings/settings-document-store），初版误连 ipc/ 转发层。
- 实际验证：desktop 定向 41 例 + agent-mode-ipc 2 例通过；`apps/desktop typecheck` 0 错；根 `tsgo` 0 错；`check:quick` exit=0；`count-ipc-channels` 652 → 646；`test:impact` 首跑 2 失败（钉死测试）后修复复跑通过（desktop + host-protocol 全量）；实现提交 `a38fdae23` 后 `test:changed --base origin/dev` 通过并推送 `main:dev`，远端 quality run 42372254724（headSha `a38fdae23`）success。
- 未运行与风险：AGENT_MODE_CHANGED 等事件广播仍走旧 IPC（事件原语另片）；UI 走查需授权未执行。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
