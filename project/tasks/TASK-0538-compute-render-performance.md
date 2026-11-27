---
id: TASK-0538
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0537]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 7d18a5f63
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/conversation/hooks/useUserMessageActions.ts
  - apps/desktop/src/renderer/domains/conversation/components/message-list/messageNavigationModel.ts
  - apps/desktop/src/renderer/shared/components/message-feed/navigationModel.ts
  - apps/desktop/src/renderer/domains/settings/components/SettingsPage.tsx
  - apps/desktop/src/renderer/domains/settings/components/settings-tab-loaders.ts
  - packages/theme-ui/src/activity/MarkdownPreviewView.tsx
  - packages/theme-ui/src/markdown/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行，随本片提交）
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 计算/渲染性能移植批：编辑订阅收窄、导航索引缓存、大 Markdown 渐进渲染、设置空闲预取

## 合同

- 来源与目标：RESEARCH-0052 分诊出的四个上游性能提交 `01ceb15c1`、`566455dae`、`15b901f49`、`82f7ab230`，手工合并到本仓分叉结构；用户价值分别是长会话编辑进出不整列重渲染、流式期间导航索引不再全量重算、大 Markdown 预览近乎即开不冻结窗口、设置常用标签首点不空白。
- 输入 → 输出：上游四提交（参考 diff 存 `temp/t0538-upstream-*.diff`）→ 本仓等价行为；行为变化仅为性能，用户可见语义不变（上游自述）。
- 做 / 不做：只做这四项移植与其必要适配；不做 TASK-0539 的画廊 iframe 项（`867179b27`/`57e3136a1`/`d99e32377`），不做上游其他提交；不扩大订阅/预取范围到上游未覆盖的位置。
- Given / When / Then：
  - 编辑状态进出 → 仅当前编辑目标消息重渲染：`useUserMessageActions.ts` 订阅收窄为「是不是我在编辑」，删除动作执行时再读编辑状态。
  - 流式输出期间 → 导航索引只对引用变化的消息重算投影，未变消息命中对象级缓存。
  - 打开 >40KB 的 Markdown 预览 → 首两段先渲染，其余段空闲时补齐，屏幕外段 `content-visibility` 跳过布局；含脚注文档不切段。
  - 进入设置页后空闲 → 预取外观等常用标签分块，首次点击不再空白等待。
- 验证：各移植的定向测试（上游新增用例同步移植）；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：不适用（纯性能行为，无可见语义变化）；工程完成标准为四项移植到位且检查全绿。

## 交付

- 实际修改与验证：
  - 编辑订阅收窄（01ceb15c1）：`useUserMessageActions.ts` 的 `useUserMessageEditAction` 改 `useMemo` 派生窄化 atom（依赖 `[entryId, isLastUserMessage]`，getter 内实时读 `pendingMessageEditAtom`）；`useUserMessageDeleteAction` 删除订阅，`perform` 内 `getDefaultStore()` 现读。与上游语义一致。
  - 导航索引缓存（566455dae）：`messageNavigationModel.ts` 模块级 `WeakMap<ChatTimelineItem, NavigationText>`（本仓分叉类型适配）；`navigationModel.ts` 新增 `truncateCodePoints`，截断只迭代到 `maxCharacters`。上游 22 行用例同步移植为形状断言。
  - 大 Markdown 渐进渲染（15b901f49）：新增 `packages/theme-ui/src/markdown/progressive-chunks.ts`（>40KB 切段、空行后 ATX 标题、围栏保护、脚注不切、链接引用复读，与上游逐字一致）+ 测试；`MarkdownPreviewView.tsx` 首两段同步、其余 `requestIdleCallback` 空闲补齐、屏外 `content-visibility: auto`。
  - 设置空闲预取（82f7ab230）：`settings-tab-loaders.ts` 新增 `useIdleSettingsTabPrefetch`（appearance/general/models，跳过当前标签，卸载取消）；`SettingsPage.tsx` 接入。上游测试移植并按要求将 `toHaveBeenCalled*` 改写为闭包计数断言，`test-assertion-baseline.json` 对应零值条目已删（棘轮只降不升）。
  - 验证：定向 desktop 4 用例 + theme-ui 7 用例绿；`test:impact` desktop 41 文件 224 用例 + theme-ui 21 用例全绿；`bun run check` exit 0（首次缺 3 个声明头已补齐后复跑通过）。
- 评审与集成：独立 verifier 复查 pass——四组实现忠实上游语义，分叉适配（ChatTimelineItem key、memo 依赖、切段边界、预取取消）无行为偏差；三 worker 并行实施、写入范围互斥，主代理统一验证集成。
- 未运行与风险：未在真机长会话实测帧率（上游性能数据不可复用于本仓环境）；`useProgressiveChunkCount` 的 count 只在 mount 初始化（上游同源行为，同一实例换大文档沿用旧 count）；渐进 wrapper 改变首子元素边距作用点（上游同）。`.local/` 未跟踪目录不入提交。
- 发布：release fragment 一个（性能改进，用户可感）。
