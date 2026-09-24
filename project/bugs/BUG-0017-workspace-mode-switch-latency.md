---
id: BUG-0017
type: bug
status: investigating
priority: P2
owner: apps/desktop
source: user-report
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: [ISSUE-0010]
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 工作区 Work/Coding 切换响应迟缓

## 用户流程

- Given：用户在同一项目的 Desktop 工作区中使用会话。
- When：用户在页头切换 Work 与 Coding（界面文案为“文档与研究 / 代码”）。
- Then：布局应及时切换到目标工作区；当前会话的提示词和能力配置仍遵循既有固化语义，不应因布局切换被静默重配。

## 实际行为

用户报告 Work 与 Coding 开发模式切换有明显延迟，体验不够连贯。当前没有测量切换耗时，也未确定延迟是布局切换、会话准备、数据加载还是控件语义造成。

## 期望行为

用户操作后应及时看到目标模式的布局反馈；任何较慢的非关键准备应与可见切换解耦，并保持当前会话配置合同。

## 最小复现

1. 打开一个项目并进入工作页面。
2. 在页头交替选择“文档与研究”和“代码”。
3. 记录点击到选中态变化、目标布局可交互的时间，并观察会话工具/提示词是否变化。

## 影响

工作模式切换感觉迟钝，降低频繁切换任务类型时的可用性。当前没有可复现的延迟阈值或性能基线。

## 根因证据

- `apps/desktop/src/renderer/domains/workspace-mode/components/WorkspaceModeSwitcher.tsx:14` 是项目级工作区切换入口。
- `apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts:6` 将 `coding` 描述为现有布局，将 `work` 描述为切换会话右侧面板；布局变化与 `agentMode` / `capabilityProfile` 的新会话派生不是同一状态。
- `ISSUE-0010` 已裁决 Work/Coding 控件语义与会话配置的分层；本 Bug 关注切换响应时间，不重开该语义决策。
- 尚无性能 trace、状态更新延迟测量或受控复现，不能断定是 React 渲染、面板装载或会话初始化造成。

根因置信度：低；用户可感知的迟缓由报告确认，瓶颈待测量。

## 回归测试

- 尚未补充。先建立切换响应时间基线，再覆盖页头切换后的选中态/布局即时反馈及已打开会话配置保持不变；性能目标应基于真实基线确定。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
