---
id: ISSUE-0010
type: issue
status: done
priority: P1
owner: apps/desktop
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
related_tasks: [TASK-0023, TASK-0024, TASK-0017, TASK-0077, TASK-0083, TASK-0102]
related_issues: [ISSUE-0005]
related_bugs: []
source: "user-request; RESEARCH-0006; ISSUE-0005 scheme C implementation"
created: 2026-09-24
updated: 2026-09-26
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Work/Coding 两套开关共用文案，调试时互相干扰

## 背景

ISSUE-0005 已裁决三轴分离：`WorkspaceMode` 管布局，`agentMode` 管提示词，`capabilityProfile` 管新会话默认工具。实现按此落地后，调试界面同时出现两个「工作 / 编程」控件，用户以为切一处即改变 Agent，实际只改了布局或只改了下一会话的提示词。

## 已知事实

- 页头 `WorkspaceModeSwitcher` 文案：`workspace.mode.work/coding` =「工作 / 编程」，aria「切换工作区模式」。
- 新会话 `AgentModeIconToggle` 文案：`agentMode.title` =「工作模式」，选项仍是「工作 / 编程」。
- 创建会话时 `capabilityProfile` 跟**当时**的 WorkspaceMode 走，之后改页头不改已开会话。
- 无记录的老会话 `agentMode` 回落 `work`，与当前页头或全局默认无关。
- Work 提示词鼓励聊天内 rendering tools；work Profile 白名单不含 `render_chart` 等插件名。
- REQ-0001 验收 #5 要求「入口分别呈现适用工具/工作流；切换布局不静默改变既有 Session」。

## 未决问题

用户在调试里看到的「模式」应是几个控件？三轴是否继续对用户暴露，还是收敛成一个可见选择、其余只做派生与徽标？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
| --- | --- | --- | --- |
| A. 维持两套开关，只改文案（工作区布局 vs 会话解释） | 不改合同 | 用户仍要理解三轴 | 文案不够仍会切错 |
| B. 用户只见一个 Work/Coding；内部同时写布局默认、新会话 `agentMode` 与 `capabilityProfile`；已开会话只显示只读徽标 | 符合「我切了工作模式」的直觉 | 需定义已开会话不重配时的提示 | 若徽标不可见，仍会以为当前会话已变 |
| C. 去掉页头布局开关，Work 面板改由会话 Profile 驱动 | 少一个控件 | 同一项目不能一边看 Work 壳、一边开 Coding 会话 | 违背 ISSUE-0005「布局即时、会话不重建」 |

## 推荐

采用 **B**，不重开 ISSUE-0005 的分层合同：

- 页头只保留一个分段控件，标签用「工作区：办公 / 编程」这类不与 `agentMode` 撞车的词。
- 新会话不再单独放同名「工作模式」；创建时从当前工作区派生 `agentMode` + `capabilityProfile`。
- 已打开的会话在输入栏显示只读「本会话：办公解释 · work 工具集」，切换页头不改它。
- 需要拆开三轴时再进高级/会话详情，不作为调试默认路径。

## 决策

2026-09-24 产品确认方案 B。实施见 `TASK-0077`。不重开 ISSUE-0005 三轴合同。

2026-09-24 文案修订：页头与徽标改称任务类型「文档与研究 / 代码」，不再用「办公 / 编程」。内部 id 仍是 `work` / `coding`。见 `TASK-0083`。

2026-09-24 编号修订：承接本 Issue 的工作区流程 UI 任务由 `TASK-0084` 改名为 `TASK-0102`（原编号与 MCP 按工具可见性任务撞号，见 `VERIFY-0008`）。决策与实施内容不变。

## 决策触发条件

产品确认 B，或指定 A/C。确认前不要改 Session 固化语义，也不要把 `agentMode` 重新做成权限开关。

## 后续可能拆出的 Task

- Desktop 文案与开关收敛（i18n + `WorkspaceModeSwitcher` / `AgentModeIconToggle`）。
- 会话只读徽标：展示已固化的 `agentMode` 与 `capabilityProfile`。
- 回归：`agent-mode-entry-points` 与「切布局不改当前会话工具集」。

## 测试合同（确认方案后写入对应 Task）

- Given：项目页头为「办公」，已有一个 coding 会话打开；When：用户只切页头；Then：当前会话工具与提示词不变，徽标仍显示 coding；新开会话才带 work 默认。
- Given：用户只使用页头开关后点「新会话」；When：发送任意消息；Then：不再出现第二套同名「工作/编程」选项作为必经步骤。
