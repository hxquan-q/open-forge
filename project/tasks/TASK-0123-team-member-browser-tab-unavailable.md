---
id: TASK-0123
type: task
status: verifying
priority: P3
owner: apps/desktop + packages/runtime-*
requirement: []
plan: PLAN-0013
source: ISSUE-0026 实测（审计员/开发员会话 `browser_tab` → `no_browser_session`）
related_requirement: []
related_plan: [PLAN-0013]
related_tasks: []
related_issues: [ISSUE-0026]
related_bugs: []
execution: parallel
branch: task/TASK-0123-member-browser-tab
worktree: .worktrees/task-0123
base_commit: main
read_paths: [apps/desktop/src/main/agent-teams/, packages/runtime-*/src/（browser_tab 装配与过滤处）, packages/agent/src/]
write_paths: [apps/desktop/src/main/agent-teams/, packages/runtime-*/src/, .github/release-notes/]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0122]
integration_status: pending
created: 2026-09-26
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 团队成员会话 `browser_tab` 不可用性显式声明

## 目标

成员会话的工具清单包含 `browser_tab`，但团队上下文没有可用 WebView 后端——模型只能撞上
`no_browser_session` 错误后才知道绕行。先按 ISSUE-0026 推荐 A 落地：**不在团队会话中广告
不可用能力**（或在描述中声明不可用与建议降级路径），消除撞错成本。

## 范围

### 并发评估

- 结论：条件支持并行——成员会话工具装配/过滤面与 TASK-0122 在
  `apps/desktop/src/main/agent-teams/` 与 `.github/release-notes/` 有写范围重叠，已登记
  `conflicts_with`，按声明顺序集成。
- 执行方式：parallel（独立 worktree）。
- 可并行 Task：TASK-0122。
- 前置依赖：先核实 `browser_tab` 在成员会话的注册路径（是直接进成员 toolDefinitions 还是经
  宿主能力收窄），确认不可用判定的实现位置再定改法。
- 冲突文件/独占路径：成员工具装配处（待定位后回填）。
- Branch：`task/TASK-0123-member-browser-tab`。
- Worktree：独立 worktree。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0013 阶段 1 次项。

### 做

- 定位 `browser_tab` 进入成员会话工具清单的装配点与 `no_browser_session` 的抛出点；
- 团队/成员会话上下文：从工具清单剔除 `browser_tab`，或保留但将描述改为「本会话无 WebView
  后端；如需渲染验证使用 shell 起本地服务+外部 headless 浏览器」——按定位结果选侵入最小者；
- 若为剔除，确认剔除范围只覆盖团队成员会话，普通 agent 会话的 `browser_tab` 不受影响。

### 不做

- 不为成员会话新建 headless 渲染工具（ISSUE-0026 方案 B，另立评估）；
- 不改变普通会话的浏览器能力；
- 不处理「起 http server 的清理责任」（属方案 B 的范畴）。

## Given / When / Then

- Given：团队成员会话需要验证生成的 HTML；
- When：模型查看可用工具清单；
- Then：清单中不再出现必然失败的 `browser_tab`（或其描述明确声明本会话不可用并给出降级
  路径）；普通 agent 会话的 `browser_tab` 行为不变。

## 必须保持

- 普通会话（非团队成员）`browser_tab` 可用性不受影响；
- 剔除若基于会话类型判定，判定必须来自会话角色/binding 而非字符串启发式；
- 工具清单变化后成员系统提示词的工具段与实际注册保持一致。

## 测试与验证

- 定向测试：成员会话工具装配的合同/集成测试——团队上下文清单无 `browser_tab`（或描述含
  不可用声明），普通上下文保留；
- 用户流程：无需 UI E2E；定向集成测试即可证明；
- 质量检查：受影响包 `test:pkg` + `check:quick`。

## 交付记录

- 实际修改：
  - 选定剔除方案（ISSUE-0026 推荐 A）：`browser_tab` 由 `browser-tab` Session Extension 按
    `functions.has(CODING_AGENT_BROWSER_TAB_FUNCTION)` 能力驱动贡献——CLI 本就因此不广告它。
    成员会话经 `sessionOptions.sessionExtensionFunctions` 会话级函数源收窄即可让工具不进入
    模型清单，无需改扩展本身。
  - `agent-runtime/function-extension-source.ts`：Composition 创建后把共享函数源登记进
    `set/getDesktopCodingAgentFunctionSource` 存取器，供成员会话包装。
  - 新增 `agent-teams/team-member-function-source.ts`：`createTeamMemberFunctionSource` 包装
    共享源，`has(browser_tab)` 恒 false、其余 token 与 `invoke` 全透传。
  - `conversations/resolve-session-config.ts`：`DesktopCodingAgentSessionConfig` 新增
    `sessionExtensionFunctions` 透传字段（不计入 runtimeConfig 顶层）。
  - `agent-teams/team-runtime-manager.ts`：新增可选 `memberSessionExtensionFunctions` 注入，
    新建成员（`createMemberRuntime`）与恢复成员（`resolveMemberSessionConfig`）两条路径都携带；
    协调 Runtime 不触碰。
  - `agent-teams/team-session-service.ts`：接线——成员函数源 = 桌面共享源经
    `createTeamMemberFunctionSource` 收窄，未初始化（如测试宿主）时回落默认源。
- 实际运行：
  - 定向测试：`team-member-function-source.test.ts`（browser_tab 不可见、其余透传、invoke 直通）；
    `team-runtime-manager.test.ts` 新增 3 例（新建/恢复成员携带收窄源、协调 Runtime 不收窄）。
  - agent-teams + agent-runtime + conversations/ipc 关联测试 49 文件 316 用例全绿；
    `bun run typecheck`（apps/desktop）与 `bun run check:quick` 全绿。
- 未运行及原因：真实团队会话的成员工具清单复核未跑（需起一次真实 Team 会话读 members 的
  model frame）——装配链 `sessionOptions.sessionExtensionFunctions → functions.has` 是既有
  合同（node-session-host 同款路径），判定为定向测试可证明范围，残余风险记录在案。
- Worktree：主工作区（serial 于 TASK-0122 集成之后，conflicts_with 窗口已闭合）。
- 剩余风险：
  - 仅隐藏成员会话；协调（队长）会话仍保留 `browser_tab`——其在有 WebView 面板的 workspace
    下真实可用，符合「剔除只覆盖成员」边界。
  - 若后续成员会话获得 WebView/headless 后端（ISSUE-0026 方案 B），需在函数源恢复可见性
    并同步移除本收窄。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑本任务交付记录点名的收窄逻辑套件（与 TASK-0122 的桌面批次同批执行）。

| 合同条款 | 本次读数 |
|---|---|
| 团队成员会话的工具清单中不再出现必然失败的 `browser_tab`（或描述显式声明不可用并给降级） | `team-member-function-source.test.ts`（browser_tab 不可见、其余透传、invoke 直通）+ `team-runtime-manager.test.ts` 新增 3 例（新建/恢复成员携带收窄源、协调 Runtime 不收窄）——均在 **4 文件 / 20 例通过** 之内 |
| 合计（本批） | `team-task-waiter`、`team-member-function-source`、`team-runtime-manager`、`TeamWaitTasksView` **4 文件 / 20 例通过，0 失败**；`packages/agent-team` 整包 **12 文件 / 85 例通过** |

- **未覆盖**：真实团队成员会话里由模型**实际查看工具清单**并据此放弃 `browser_tab` 的行为面。合同原文允许「不再出现」**或**「描述显式声明不可用」，本轮只验证了实现选了前者（工具源收窄），未验证模型读到的最终清单在真实会话中的渲染结果。
- **关闭建议**：收窄逻辑测试级成立（含「协调 Runtime 不收窄」的对照），倾向 `done`；模型行为面是否要求补测，请用户裁定。
