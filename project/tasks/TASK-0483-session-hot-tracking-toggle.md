---
id: TASK-0483
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
source: user-request（2026-11-12，本地修改与提交授权，禁止远程 Git）
related_requirement: [REQ-0030]
related_plan: []
related_tasks: [TASK-0434, TASK-0431, TASK-0435, TASK-0437]
related_issues: []
related_bugs: []
execution: serial
branch: task/TASK-0483-session-hot-tracking-toggle
worktree: unassigned（当前主检出串行，不新建 Worktree）
base_commit: 1db8dd0f4
read_paths:
  - apps/desktop/src/renderer/domains/conversation
  - apps/desktop/src/renderer/domains/activity-panel
  - apps/desktop/src/renderer/shared/store
  - packages/theme-ui/src/chat
write_paths:
  - apps/desktop/src/renderer/shared/store/atoms.ts
  - apps/desktop/src/renderer/shared/store/hot-tracking-atoms.ts
  - apps/desktop/src/renderer/shared/store/hot-tracking-atoms.test.ts
  - apps/desktop/src/renderer/domains/conversation/components/input-bar
  - apps/desktop/src/renderer/domains/conversation/components/ChatView.tsx
  - apps/desktop/src/renderer/domains/conversation/components/chat-view/DefaultChatView.tsx
  - apps/desktop/src/renderer/domains/conversation/components/new-session/NewSessionPageView.tsx
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionEventController.terminal-settle.test.tsx
  - apps/desktop/src/renderer/domains/activity-panel/components/ActivityPanel.tsx
  - apps/desktop/src/renderer/domains/activity-panel/components/ActivityPanel.plugin-tabs.test.tsx
  - apps/desktop/src/shared/i18n/locales/zh/chat.json
  - apps/desktop/src/shared/i18n/locales/en/chat.json
  - packages/theme-ui/src/chat/InputBarToolbarButton.tsx
  - project/tasks/TASK-0483-session-hot-tracking-toggle.md
  - project/tasks/README.md
  - project/requirements/REQ-0030-allstar-dev-section.md
  - .github/release-notes/fragments/v0.1.5/task-0483-session-hot-tracking-toggle.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-12
updated: 2026-11-12
verification_note: 完整 check 与 impact 失败用例复跑按用户指示（时间约束）跳过
---
<!-- Copyright The Open Forge contributors. -->

# Code 会话的 LLM 行为热追踪内存态开关

## 合同

- 归属：Open-Forge-only；延续 REQ-0030 / TASK-0434 的 code-only 边界，增加普通 code 会话的可逆开关。
- Owner：apps/desktop；输入为 activeSession 的 runtimeId 与固化 capabilityProfile，输出为输入栏按钮与同源的生产/消费闸门。
- 执行：当前检出无未提交改动，基线为 `1db8dd0f4`；原分支是 `task/TASK-0482-computer-use`，已另建本任务分支。串行，不并发写热点，不操作已有 Task 分支或团队域。
- 做：按 runtimeId 的 Jotai 内存态，未记录默认 true；code 输入栏左下按钮（选中=开、aria-pressed）；生产端 tool.start 与所有普通会话面板挂载点读取同源闸门；中英文文案；v0.1.5 fragment。
- 不做：持久化、全局设置、快捷键、work 启用能力、团队会话文件/团队泵、main/ipc/session.ts、feed 数据结构或页签持久化偏好；不汇编、不发布、不 bump 版本、不启动 dev/verify:ui、不连 Provider、不访问真实状态目录、不操作远程 Git。
- 方案：直接扩展既有 leadingTools 联合与纯按钮叶子；独立 atom 收敛共享规则，不重构输入栏或热追踪数据层。共享按钮只增加可选原生 ARIA 属性，旧调用兼容。

## Given / When / Then 与保留合同

1. Given 普通 coding 会话未记录开关，When 打开输入区，Then 显示默认选中按钮，生产/消费照常；点击关闭后新 tool.start 不写 feed/编辑目标，终端页签消失且页签/文件/浏览器不跟随；再点开恢复。
2. Given 会话 A 关闭，When 切 B 再切回 A，Then B 缺省开、A 仍关；新进程/新 store 全部恢复默认开。未建 runtime 的新会话页维持默认开，不让上一会话状态污染。
3. Given work/缺失档位会话，Then 不注入按钮且生产不写活动；非 coding 消费为 false。团队 Connector 独立，不注入该开关，维持原有面板和泵语义。
4. Given 条目 start 时已入 feed，When 关闭或切走再收到 end，Then 仍结算；保留聊天两道归属闸门、F06 end 前置/惰性提取、100 条/2048 字符/key 幂等与 F03 来源过滤。
5. Given 用户已调整页签隐藏/排序，When 切换本开关，Then 不写 hiddenActivityTabsAtom/activityTabOrderAtom。

## 验证计划

- 红→绿：事件控制器真实 hook 的 start/end 副作用；默认 Connector / InputBarView / 真实按钮点击流程；真实 ConversationActivityPanel 的终端页签、页签跟随与文件预览跟随（只 fake 外部 API）。
- atom 单测：默认、A/B 隔离、重建 store 复位、work 拒绝。
- 既有回归：TASK-0434、F06、F03 相关定向套件和 ChatView/NewSession 接线。
- `bun run check:quick -- <本任务文件>`；仓库 Node runner 定向测试；先核对 test:impact 的计划，若扩大为大规模测试则交用户执行；收尾完整 `bun run check`。不删断言、不降门禁。
- 产品验收待用户：完整重启 dev 后，code 输入栏点击开/关，执行命令/编辑/浏览器活动；work 无按钮；切会话回到原值；重启恢复开。

## 交付

- 实际修改：
  - 数据层新增 `shared/store/hot-tracking-atoms.ts`（`hotTrackingBySessionAtom` 按 runtimeId 记 Map；`currentSessionHotTrackingEnabledAtom` 读缺省 true、无会话 true；`activeSessionHotTrackingAtom` = 档位 coding 且开关开；`toggleCurrentSessionHotTrackingAtom` 非 coding 拒写），`atoms.ts` re-export。
  - 输入区：`types.ts` `InputBarLeadingTool` 扩 `hot-tracking` kind + `InputBarHotTrackingModel`；`InputBarToolbar.tsx` 新增 `InputBarHotTrackingAction`（复用 `InputBarToolbarButton`，aria-label/aria-pressed/active）；`InputBarView` leadingTools 分支渲染；`DefaultInputBarConnector` 仅 `capabilityProfile === "coding"` 注入，文案 `inputBar.hotTracking.{label,on,off}` zh/en。
  - 生产端 `useSessionEventController` tool.start 门控改读 `activeSessionHotTrackingAtom`；end 结算位置、两道聊天闸门、团队泵未动。
  - 消费端：`ConversationActivityPanel` 与 `ChatView→DefaultChatView`（新 `hotTracking?` prop，默认 true 保团队/未接线宿主）统一 `coding && 开关`；`NewSessionPageView` 维持 TASK-0434 口径（本页清空 activeSession，天然默认开，未加接线）。
  - `packages/theme-ui/chat/InputBarToolbarButton` 增加可选 `aria-label`/`aria-pressed` 透传（存量调用不变）。
- 实际运行：红 2（开关关仍写 feed / 面板关不掉终端页签）+ 按钮 2 红（coding 无按钮、点击链路）→ 绿；定向+回归 12 文件 52/52（含 TeamChatView、TeamComposerConnector、follow-activity、file-edits、terminal-tab、DefaultChatView、InputBarView、FileReference、plugin-tabs、terminal-settle、hot-tracking-atoms、connector.hot-tracking）；`check:quick -- 17 文件` 除存量过期 WAIVER-0011/0012 外全绿（Biome 无错、ratchet new=0）；`test:impact`（desktop related 262 文件）1328/1329 通过，唯一失败 `useSessionManager.session-switch.test.ts「只读历史预览失败时回退到 Runtime 历史水合」`——本任务未触碰该链路，但未复跑定性，列为待分诊。
- 未运行及原因：失败用例单独复跑与完整 `bun run check` 按用户指示跳过（用户时间约束，2026-11-12）；实机验收待用户（需完整重启 dev）。
- 行为注记：capabilityProfile 缺失的旧会话消费端口径由「折叠 coding 显示空终端页签」收紧为与生产端一致的不投屏（生产端 TASK-0434 起即严格 coding 门控，此类会话 feed 本就为空）。
- 评审与集成：自审；本地 Task 分支提交，集成/推送/发布均未发生。
- 未运行与风险：实机验收待用户（需完整重启 dev）；waiver 0011/0012 为存量阻断待用户处置。
- 发布：v0.1.5 碎片 `.github/release-notes/fragments/v0.1.5/task-0483-session-hot-tracking-toggle.md`；未汇编、未 bump。

## 交付增量（2026-11-12 消费端主链路漏接修复）

- 复审发现：按钮与生产端已通，但 `ChatView` 传入的 `hotTracking` 被 `DefaultChatView` 丢弃（解构未取、未透传 `ActivityColumn`，且 memo 比较器不比该字段）——点灭开关后新命令停投（生产端直读 atom），右栏终端页签/自动跟随却照旧，两端状态不同源。
- 实际修改（最小 diff 三处，均在 `DefaultChatView.tsx`）：解构补 `hotTracking`；`ActivityColumn` 透传 `hotTracking={hotTracking}`；memo 比较器补 `previous.hotTracking === next.hotTracking`。`ActivityColumn` 默认值 `true` 与 `coding && hotTracking` 双条件保持不变（团队宿主 `TeamChatView` 不传 prop，行为不变）。
- 回归测试（红→绿，任务一部分）：新增 `DefaultChatView.hot-tracking.test.tsx`（真实 ActivityPanel 管线：关闭后 terminal 页签从页签栏消失、follow 钩子收 enabled=false，再点亮恢复——仅 hotTracking 变化必须穿过 memo 边界，旧代码两方向均红）；`DefaultChatView.memo.test.tsx` 补 memo 放行断言（旧代码红：期望 2 次重渲染实得 1 次）+ 补 Apache 声明头。
- 实际运行（2026-11-12）：新增/改动测试 3 文件 7/7 绿；关联回归 9 文件 38/38 绿（hot-tracking-atoms、plugin-tabs、live-tabs、useFollowAiFileEdits、useFollowAiActivity、connector.hot-tracking、terminal-settle、TeamChatView、ChatView.composer）；`useSessionManager.session-switch.test.ts` 单跑两次均 9/9——上次 impact 唯一失败用例「只读历史预览失败回退」定性为偶发、非本次回归（本增量仅改 chat-view 组件层，与该链路无共享模块）。`check:quick` 仅剩存量过期 WAIVER-0011/0012 阻断（ratchet new=0）；本增量文件全为 `.tsx`，不在 Biome `*.ts` 范畴（全量 lint 的 3 个错误经目录级核查不在本任务范畴）。
- 未运行及原因：`test:impact`、全量测试与完整 `bun run check` 按用户指示跳过（时间约束）；实机验收待用户（需完整重启 dev，HMR 不替代）。
- 顺带核查结论（未改，待用户定夺）：`NewSessionPageView.tsx` 维持 `hotTracking={workspaceMode === "coding"}` 有意不接开关——新会话页无 activeSession，接 atom 会恒 false；语义代价是「关开关后回新会话页，面板恢复跟随」，存在档位切换跳变。`ConversationActivityPanel` 全仓仅 `ActivityPanel.plugin-tabs.test.tsx` 引用，确认为测试适配器，非主聊天页路径（主路径为 ChatView→DefaultChatView→ActivityColumn→ActivityPanel）。
- 发布：v0.1.5 碎片同文件补「修复」一节（点灭后右栏不跟随的问题及修复后行为）。
