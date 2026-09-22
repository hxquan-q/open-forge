---
id: ISSUE-0005
type: issue
status: done
priority: P1
owner: product/runtime
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
source: exprot/mvp-scope.md; docs/adr/0071-agent-mode-is-a-task-interpretation-prior.md; TASK-0023
created: 2026-09-22
updated: 2026-09-23
---

# Work/Coding 布局、AgentMode 与能力 Profile 的边界

## 背景

历史 MVP 把 Work/Coding 定义为不同的 Profile、Prompt、Tool Catalog、Memory 与 UI 面板；
已接受的 ADR-0071 则规定 `agentMode` 只影响任务解释提示词，不隐藏 Tool、Skill、Plugin、MCP 或 Hook。
新定稿的 TASK-0023/TASK-0024 又引入了项目级 `WorkspaceMode`，只切换布局且不重建当前 Session。

这涉及三个容易被同名“工作模式”混淆的事实：项目工作区布局、会话级提示词偏向、会话可用能力/权限。若把它们塞进同一字符串或同一持久化字段，UI 可能显示 Work 布局而 Agent 仍使用 Coding Prompt，或工作模式被误当成安全边界。

## 已知事实

- `exprot/mvp-scope.md` 要求两个入口有独立 Tool Catalog 与 Profile。
- ADR-0071 明确禁止 `agentMode` 对能力面施加硬过滤；工作模式不是权限。
- TASK-0023 的 IA 决策是按 project cwd 保存 `WorkspaceMode`，即时改变布局，不中断或重建现有 Session。
- Desktop 已有会话创建时固化的 `agentMode`；Tool Policy / Trust / Approval 是独立执行授权面。

## 未决问题

切换 Work/Coding 时，究竟只切换 UI 布局、设置新 Session 的 Agent Profile，还是也改变当前 Session 的工具/Memory 能力？当前 Session 与项目默认值不同步时，界面应如何标示？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 一个模式字段同时控制布局、Prompt、Tool Catalog 和 Memory | 用户只看见一个选择，符合历史 MVP 的表面模型 | 直接推翻 ADR-0071；需要 Session 持久化、旧会话和 Turn generation 迁移合同 | 将体验偏好和能力/安全边界耦合，容易把隐藏 Tool 当作授权 |
| B. `WorkspaceMode` 只管布局，`agentMode` 只管 Prompt，工具集合不随模式改变 | 尊重 ADR-0071，改动和兼容风险最小 | 不满足历史 MVP 的独立 Tool Catalog；Work/Coding 可能只是布局与文案差异 | 若标签不区分“工作区布局”与“Agent 模式”，用户会误解能力变化 |
| C. 分离 `WorkspaceMode`、`agentMode` 与 Session `agentProfileId`/capability policy | 保留软提示词模式，同时能表达 Work/Coding 的不同默认工具与 Memory | 增加配置轴、Session 固化和切换说明；必须明确 Profile 不是授权，执行仍走 Permission/Trust/Approval | 若 UI 把多轴压成一个无说明开关，仍会出现布局与 Agent 行为不一致 |

## 推荐

采用方案 C 的分层合同：`WorkspaceMode` 只决定项目界面；`agentMode` 保持 ADR-0071 的提示词偏向；需要不同 Tool Catalog/Memory 时由独立 `agentProfileId` 固化到新 Session。能力可见性不替代执行授权，写入/网络等动作仍须经过 Tool Policy 与 Approval。新 Session 从当前工作区选择派生默认 Profile；已创建 Session 保留自己的 Profile，切换工作区布局不静默重配正在运行的 Session。

若产品不接受额外 Profile 轴，应回退到方案 B，并明确修订 REQ-0001/exprot 目标中的独立 Tool Catalog 承诺，而不是让 `agentMode` 暗中成为权限开关。

## 决策触发条件

在 TASK-0017 Profile Composition、TASK-0021 Catalog resolver 或更改 `agentMode` 持久化前，由产品确认推荐方案或指定替代方案；若采用 A，必须先修订 ADR-0071 并说明迁移、旧会话和安全合同。

## 后续 Task

- TASK-0017、TASK-0018、TASK-0019、TASK-0021 在此决策前不得实现按 Work/Coding 隐藏 Tool 或切换会话能力的行为。
- TASK-0024 的 WorkspaceMode 继续作为布局状态；若其视觉选择与 Agent Profile 的联动需变化，应由本 Issue 的决议另开 Task。

## 决策（2026-09-23）

**采用方案 C**（用户裁决）：`WorkspaceMode` 只决定项目界面布局；`agentMode` 保持
ADR-0071 的提示词偏向；Work/Coding 不同的默认 Tool Catalog / Memory 由独立
`agentProfileId` 表达，创建新 Session 时固化，切换工作区布局不静默重配已存在的
Session。能力可见性不替代执行授权：写入、网络等副作用一律继续走 Tool Policy 与
Approval（TASK-0016 落地）。TASK-0017/0018/0019/0021 的阻塞解除，按此合同实施。
