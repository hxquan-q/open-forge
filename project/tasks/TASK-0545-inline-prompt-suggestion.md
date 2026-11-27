---
id: TASK-0545
type: task
status: verifying
priority: P3
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0544]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: b65ae1b47
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/conversation/components/input-bar/
  - apps/desktop/src/renderer/domains/conversation/components/SuggestionBubbles.tsx
  - apps/desktop/src/renderer/domains/conversation/hooks/useSuggestionBubblesModel.ts
  - apps/desktop/src/renderer/domains/settings/components/AgentSettingsView.tsx
  - apps/desktop/src/renderer/shared/store/chat-atoms.ts
  - apps/desktop/src/shared/i18n/locales/
  - project/tasks/
  - project/research/RESEARCH-0052-upstream-0.6.20-0.6.31-commit-triage.md
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 输入预测两件套：第一条内联进输入框（Tab 填入/Esc 放弃）+ 开关移入个性化

## 合同

- 来源与目标：上游 `ec42f4d02`（第一条预测以淡色显示在空输入框，Tab 填入不发送、打字或 Esc 放弃本轮不再出现、气泡只留其余几条）与 `e1d4baa74`（开关从实验区移到个性化）。台账 RESEARCH-0052「可直接采纳」区输入预测两个。落点核对结论（2026-11-27）：
  - 本仓已有输入预测功能：`promptSuggestionsAtom`（`chat-atoms.ts:408`）、气泡模型 `useSuggestionBubblesModel.ts`、`useInputBarSuggestionSource`（`useInputBarSources.ts`）把第一条进 placeholder（前缀 `↵`），空输入框回车直发第一条经 `useInputBarTriggerModel` 的 `firstSuggestion`。
  - 缺口：无内联预测 hook、无 `promptSuggestionDismissedAtom`、无 Tab 填入/Esc 放弃；placeholder 仍带 `session.placeholderVisible` 条件；气泡未 `slice(1)`；开关在实验区。
  - 本仓分叉适配点：`useInputBarSources.ts` 的 `inputActiveSessionAtom` 带 agentMode/capabilityProfile 选择（分叉保留，不影响本特性）；`AgentSettingsView.tsx` 个性化区整体重写（textarea + Apply 按钮），输入预测行按上游相对位置插在自定义指令之后——开关为即时生效，不走 Apply；i18n `inputPredictionDesc` 本仓文案已分叉（含「不适用于批量与转移会话」），按新行为重写并保留分叉信息。
  - 不适用：上游 `AgentSettingsView` 的 `CustomInstructionsDialog` 结构变更（本仓已分叉重写，仅移植输入预测行的位置移动）。
- 输入 → 输出：上游最终态语义 → 第一条预测淡显空输入框、Tab 填入、Esc/打字放弃、气泡减一条、开关在个性化区。
- 做 / 不做：`useInlinePromptSuggestion.ts` hook 逐字移植（本仓无分叉冲突面）；connector 接法、atoms、bubbles slice、settings 行移动、i18n 按分叉改写；不做空输入回车直发的移除（上游明确保留该行为，`useInputBarTriggerModel` 的 `firstSuggestion` 链不动）。
- Given / When / Then：
  - 空输入框且有预测 → 第一条以 `Tab ⇥` 前缀淡显在 placeholder，气泡列表只含第 2 条起。
  - 按 Tab（无修饰键、非组合输入）→ 预测写进输入框不发送，placeholder 不再显示该条。
  - 打字/Esc/粘贴后 → 本轮该组第一条不再出现，删回空也不回来；新一轮预测（新数组引用）重新显示。
  - 预测到达时输入框已有字 → 该条直接视为不接受。
  - `/`、`@` 菜单打开时 Tab/Esc 归菜单，内联预测不抢键。
  - 空输入框按回车仍直发第一条预测（既有行为保留）。
  - 设置页个性化区出现输入预测开关（即时生效），实验区不再有该行。
- 保留：`useInputBarTriggerModel` 的 Enter 直发链与 perf 埋点不动；`useInputBarSuggestionSource` 按上游删除（本仓唯二引用点为 connector，随移植一并清掉）；批量与转移会话不适用的分叉说明保留在 i18n 文案。
- 验证：移植上游 `useInlinePromptSuggestion.test.tsx`（5 用例，DOM/store 断言为主，核对无 `toHaveBeenCalled*` 新增）；补 bubbles slice 与 settings 行位置的定向断言（若本仓既有测试覆盖则扩展）；`bun run test:impact`；`bun run check`。
- 人工验收：不适用（交互逻辑由 hook 单测与接线核对锁定；观感为淡色 placeholder，静态样式无新增）。

## 交付

- 实施（2026-11-27）：
  - `useInlinePromptSuggestion.ts` + 上游 5 用例测试逐字移植（fork 新文件 Copyright 头）：第一条预测淡显空输入框不写编辑器；Tab 填入不发送；Esc/打字/粘贴放弃且本轮（按数组引用记忆 `promptSuggestionDismissedAtom`）不再出现；修饰键与 isComposing 放行；预测到达时输入框已有字直接视为不接受。
  - `DefaultInputBarConnector.tsx`：`firstSuggestion` 改由 inline hook 提供，placeholder 去掉 `session.placeholderVisible` 冗余条件；`handleKeyDown` 包装——slash/at 菜单打开时 Tab/Esc 归菜单，否则先 inline 后 planMode；Enter 直发链（`useInputBarTriggerModel`）按上游保留未动。
  - `useInputBarSources.ts` 删除 `useInputBarSuggestionSource`（上游同）；`useSuggestionBubblesModel.ts` 改 `list?.slice(1)`，气泡只留第 2 条起。
  - `AgentSettingsView.tsx` 输入预测开关从实验区移到个性化区自定义指令之后（即时生效，不走 Apply；上游 CustomInstructionsDialog 重构不适用未移植）；settings.json zh/en `inputPredictionDesc` 重写并保留分叉信息（en 保留 "one extra light model call per round. Not applicable to batch tasks and transfer sessions"）。
  - chat.json zh/en 新增 `"suggestion": "Tab ⇥  {{suggestion}}"`。
  - 新增接线与行为测试 5 用例：connector Tab 填入+放弃不回/Esc 放弃+新一轮重现（findByText 异步查询应对 AnimatePresence mode="wait" 换帧）、bubbles slice 2 例、settings 行位置 1 例。
- 验证（全部实际执行）：
  - 定向测试：hook 5 + connector 2 + bubbles 2 + settings 1 共 10 用例全过。
  - `bun run test:impact`（7 个改动源文件）：desktop 288 文件 1517 用例全过。
  - `bun run check`：lint/types/guards/mobile 全绿；声明头审计 missing=0（审计按 merge-base diff 判定，bubbles 两文件与 AgentSettingsView 补 Modified 头——与 upstream/dev 逐字一致不免除）。
  - 独立 verifier 复查结论 complete：移植忠实度逐字比对通过、键处理链无吞键/双重处理、消费方无残留引用、测试无新增 `toHaveBeenCalled*`、i18n 分叉保留正确。
- 未运行：人工 UI 验收（合同定为不适用；交互由 hook 单测与接线核对锁定）。
- 风险/观察：AnimatePresence mode="wait" 下 placeholder 新文案微任务后才落 DOM（测试时序教训已记入）；`promptSuggestionDismissedAtom` 按 runtimeId 累积引用不清除系上游设计取舍。
