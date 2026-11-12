---
id: TASK-0484
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0030
source: user-request-2026-11-12
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0187]
execution: serial
branch: task/TASK-0483-session-hot-tracking-toggle
worktree: unassigned（主工作区串行）
read_paths:
  - apps/desktop/src/main/agent-teams
  - apps/desktop/src/main/conversations
  - apps/desktop/src/main/agent-modes
  - apps/desktop/src/main/agent-runtime
write_paths:
  - apps/desktop/src/main/agent-teams/team-runtime-manager.ts
  - apps/desktop/src/main/agent-teams/team-runtime-manager.test.ts
  - apps/desktop/src/main/conversations/resolve-session-config.ts
  - apps/desktop/src/main/conversations/resolve-session-config.test.ts
  - apps/desktop/src/main/agent-teams/team-session-state-repository.ts
  - apps/desktop/src/main/agent-teams/team-session-service.ts
  - apps/desktop/src/main/computer-use/controller.ts
  - apps/desktop/src/main/computer-use/host.ts
  - apps/desktop/src/renderer/root-layout
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/renderer/domains/computer-use
  - .github/release-notes/fragments/v0.1.5
exclusive_paths:
  - apps/desktop/src/main/agent-teams/team-runtime-manager.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-12
updated: 2026-11-12
base_commit: 393611e2a9a4e9daef69692ea0a403503cc0cbea
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话档位两轴对齐单 Agent code 会话（agentMode 钉 coding）

## 合同

- 来源与目标：`BUG-0187`。用户 2026-11-12 决定——团队会话的档位按「跟单 Agent 的 code 模式会话等同」落地，即 `agentMode` 与 `capabilityProfile` 两轴都为 `coding`。本任务只做这一件事。
- 输入 → 输出：`team-runtime-manager.ts` 三处 `resolveDesktopSessionConfig` 入参 → 三处都显式携带 `agentMode: "coding"`；既有会话配置其余字段不变。
- 做 / 不做：
  - 做：三处团队 Runtime 入口（成员创建、协调创建、成员恢复/重配）下发 `agentMode: "coding"`，与 `capabilityProfile` 同值；扩展定向测试断言两轴一致。
  - 不做：不写 `agent-modes.json`（团队档位仍由常量裁决，避免共享索引读放大与高频 persist 路径）；不改内核域 `renderer/domains/conversation/`；不动 Allstar 版块聚合、侧栏高亮、computer-use 授权主体（各自独立切片）；不改 `REQ-0030` 现有未提交内容。
  - 并发结论：串行。写域为单个主进程文件与其测试，与用户正在进行的热追踪改动（`ChatView` / `atoms` / `hot-tracking-atoms`）无重叠，无需独立 Worktree。
- Given / When / Then：
  - Given 团队会话新建或恢复，When 解析成员/协调 Runtime 会话配置，Then 入参同时带 `agentMode: "coding"` 与 `capabilityProfile: "coding"`。
  - Given 已修复环境，When 成员执行任务，Then 系统提示词注入 `coding.md` 正文（含 Project AI workspace 段），`projectAiWorkspace` 生效，Memory/Journal 落在项目 AI 工作区。
- 保留：
  - 成员与协调 Runtime 的全量工具面（不引入 WORK_PROFILE 收紧）；
  - 团队编排、委派合同、pin 上下文、函数源收窄、失效绑定自愈逻辑；
  - 团队会话持久化格式与 `TeamSessionDocument` schema 不变；
  - `filterUserSessions` 的所有权过滤与双列表可见性规则不变。
- 验证：
  - `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/agent-teams/team-runtime-manager.test.ts`（修复前新断言必红，修复后全绿）；
  - `bun run check:quick -- <改动文件>`；收尾一轮 `bun run check`。
- 人工验收：用户完整重启 `apps/desktop` 的 `bun run dev` 后重跑彩排，确认团队成员行为符合 coding 先验；本任务不自行启动应用。

## 交付

- 实际修改与验证：见下方「交付记录」。
- 评审与集成：自审；`integration_status` 保持 `pending`，未提交。
- 未运行与风险：如实记录。
- 发布：`.github/release-notes/fragments/v0.1.5/bug-0187-team-runtime-agent-mode.md`。

## 交付记录

2026-11-12 实施完成，三个原子提交（base_commit `393611e2a`）：

### Slice 1 档位两轴（`305dfd5d6`）

- `team-runtime-manager.ts`：新增 `TEAM_AGENT_MODE`，与 `TEAM_CAPABILITY_PROFILE` 同值在成员创建/协调创建/成员恢复三处入口显式下发；裁决注释扩写为两轴说明（为何钉、缺省会变 work、不落盘取舍）。
- **超出原合同的一处必要修改**：`resolve-session-config.ts` 的 `resolveSessionAgentMode` 恢复分支在无固化记录时改为「显式请求优先于 LEGACY 常量」。复核发现恢复路径完全忽略请求的 `agentMode`（团队会话无 agent-modes.json 记录 → 恒回落 work），只改 team-runtime-manager 三处入参修不了恢复路径，不满足验收「新建或恢复均为 coding」。全仓核实无任何现存调用方在恢复请求里传 `agentMode`（openSession 只传 cwd/sessionPath/executionMode，渲染层 TASK-0078 后不随 resume 下发派生轴），改动对现有流行为中性；两条守卫测试锁住（有记录仍忽略请求 / 不携带仍回落 LEGACY）。
- 测试：`team-runtime-manager.test.ts` 四条路径断言两轴均为 coding 且同值；`resolve-session-config.test.ts` 恢复链三分支。旧实现实证 6 断言红 → 修复后 28/28 绿。

### Slice 2 computer-use 授权主体（`f48bcea87`）

- `controller.ts`：可注入 `resolveSubject(runtimeSessionId)`，execute 先解析授权主体再比对；缺省恒等（单 Agent 行为零变化），解析 undefined 一律 fail-closed；单主体互斥不变。
- `team-session-state-repository.ts`：runtimeId→teamSessionId 反向索引（set 增量维护、换员漂移摘旧键、remove/removeCached 摘除），O(1) 内存查。
- `team-session-service.ts`：`isKnownTeamSession` / `teamSessionIdForRuntimeSession` / `teamSessionName` 只读查询。
- `host.ts`：validateSession 团队主体分支（直接喂 getSessionView 会 invalid_session）；授权主体展示名优先团队标题。
- 渲染层：`activeTeamSessionAtom`（chat-atoms）+ root-layout 跟踪器 `useActiveTeamSessionContext`（团队会话路由记录、进普通会话面清空、computer-use 等页面保留）；`ComputerUsePage` 授权主体 = 团队语境 ?? activeSession，团队语境「回到会话」导航团队路由。
- 测试：旧实现「授权给团队、成员 runtime 调用」2 断言红实证；索引维护/语境跟踪/互斥共 41 用例绿（渲染层用例需在 apps/desktop 目录内跑 runner）。

### Slice 3 版块与入口（`16e40c8e6`）

- `useAllstarDevHomePageModel`：并入团队会话、按会话 cwd 归卡（不用 placement）、卡片条目扩 kind/teamId/teamSessionId、团队条目分派 `/agent-teams/$teamId/sessions/$sessionId`；`AllstarDevHomePageView` 团队行带标识（i18n `allstarDev.home.teamSession`）。
- `useSidebarModel`：高亮复用导出的 `useCodingLayoutState`（消除第三份路由判定），团队路由/成员子路由命中「Allstar自主开发」高亮。
- `team-sidebar-conversation-projection.ts`：placement 名单并入 allstarProjects（对齐 BUG-0163），提取 `readSidebarProjectPaths`。
- `useTeamSidebarConversations` 跨域复用，提升至 `@shared/hooks`，四个面板测试 mock 路径同步更新。
- 测试：禁用实现对照实证「卡片含团队会话」「团队路由高亮」红；恢复后 projection 3 + 渲染层 13 + 面板 17 + 视图 7 绿。

### 验证命令与结果

- 定向测试全部通过（合计 28+41+40 用例，含各片红→绿对照）。
- `bun run check:quick -- <改动文件>`：lint/类型/守卫对改动文件全绿。
- `bun run check:types`（全量）：除两处**预存**问题外全绿——`useSessionEventController.terminal-settle.test.tsx`（用户 TASK-0483 基线 `393611e2a` 已提交的类型错误，未触碰）；check:guards 的 WAIVER-0011/0012 过期（2026-11-11，存量治理项，需 owner 复审）。

### 未运行项（用户 2026-11-12 指示跳过或属用户验收）

- `bun run test:impact`、完整 `bun run check`、E2E、`verify:ui:*`、真实 Desktop/computer-use 后端——用户因时间限制指示跳过影响面与全量；实机彩排由用户完整重启 `bun run dev` 后执行。

### 发布碎片

- `fragments/v0.1.5/bug-0187-team-runtime-agent-mode.md`（修复）
- `fragments/v0.1.5/bug-0187-team-computer-use-grant.md`（修复）
- `fragments/v0.1.5/bug-0187-allstar-team-sessions.md`（改进）

### 已知风险与限制

- 团队成员 Memory/Journal（MEMORY.md/JOURNAL.md）落点从会话 cwd 迁到项目 AI 工作区；存量团队会话已写入 cwd 的文件不自动迁移（碎片已提示用户可手动搬移）。
- computer-use 团队授权：换员/恢复导致成员 runtimeId 漂移时授权仍有效（主体是团队会话）；但团队会话被空闲逐出后 `isKnownTeamSession` 为 false（打开中的会话有订阅保护，正常不受影响）。授权主体是团队会话整体：任一成员都可操作，符合「单主体互斥」口径。
- 团队档位不落盘：将来若把团队会话迁到走 desktop-conversation-service 创建，需同步处理 agent-modes.json 固化语义。
- `activeTeamSessionAtom` 语境随重启重置（用户需重新进入团队会话后再开授权页）。
