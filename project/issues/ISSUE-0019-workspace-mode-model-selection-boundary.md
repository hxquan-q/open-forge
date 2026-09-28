---
id: ISSUE-0019
type: issue
status: done
priority: P1
owner: apps/desktop
source: user-request; source inspection
created: 2026-09-24
updated: 2026-09-26
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0010]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Work/Coding 模式与模型选择范围需要明确区分

## 背景

用户认为“代码”模式下仍可选择文档与研究用途的模型不合理，并提出是否应区分模型类型、以及开始对话后是否隐藏模型切换。当前实现把工作区布局、会话 AgentMode/能力配置和模型选择作为不同状态；但用户可见界面尚未明确说明“工作区模式”和“模型用途/会话模型”的关系。

## 已知事实

- `ISSUE-0010` 已明确 `WorkspaceMode`、`agentMode` 与 `capabilityProfile` 是不同轴；页头的“文档与研究 / 代码”是工作区/任务类型选择，不会自动重配已打开会话。
- `apps/desktop/src/renderer/shared/components/ModelSelect/useModelOptions.ts:95` 合并本地与远程模型目录，`:101` 仅按 Provider 分组；没有按 WorkspaceMode 或文档研究/代码用途筛选模型。
- `apps/desktop/src/renderer/domains/conversation/hooks/useModelSelectorModel.ts:135` 的选择处理会更新当前选择；`:146` 在普通会话输入框路径向活动 Session 写入 `modelKey`。模型选择不是 WorkspaceMode 的别名。
- `apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx:189` 在普通对话输入中启用活动会话模型更新。
- 源码中存在模型 selector 的 session scope 支持，但普通对话选择器仍使用全局模型目录；当前代码没有建立“代码模式只显示代码模型、文档模式只显示研究模型”的分类合同。

## 未决问题

1. 是否需要在模型元数据中增加用途分类并按“代码 / 文档与研究”过滤，还是允许用户在任一工作区选择任意模型？
2. 模型选择是新会话默认偏好、当前会话配置，还是当前 Turn 的配置？用户切换后从哪一条消息开始生效？
3. 对话开始后是否隐藏切换入口，还是保留并明确“后续回复使用”的作用域？隐藏会降低误操作，却也阻止用户修正当前会话的模型。
4. 模型支持图像、工具调用或特定 Provider 的能力差异如何展示并约束选择？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 保留任意模型选择，仅明确作用域与生效时间；在流式 Turn 中暂时禁用，Turn 结束后继续可改 | 保留灵活性，贴合现有“模型是会话设置”的实现 | 用户仍需理解不同模型的适用场景 | 只改说明未必能阻止用户选择不适合当前任务的模型 |
| B. 为模型增加用途/能力分类，随 WorkspaceMode 提供推荐或筛选，同时允许显式展开全部模型 | 让代码与研究工作流更容易选到合适模型，保留高级用户自由度 | 需要可靠维护模型元数据，远程目录与用户自定义模型需定义默认分类 | 分类错误可能错误隐藏模型或制造能力承诺 |
| C. 开始对话后隐藏模型选择器 | 降低会话中途改模型的误用 | 无法修正慢、不可用或能力不足的模型 | 把可恢复的用户选择变成必须新建会话的限制 |

## 推荐

优先采用 A 的作用域清晰化，并评估 B 的渐进推荐方式；不建议开始对话后永久隐藏模型切换。模型选择应与 WorkspaceMode 分开表达：模式描述当前工作布局/任务类型，模型选择描述当前会话后续请求使用的 Provider/模型。若产品确认支持中途切换，应明确仅影响后续 Turn；活动 Turn 期间的可编辑策略需避免产生请求竞态。

## 决策触发条件

确认模型切换的生效边界（仅新会话、后续 Turn 或当前 Turn）及用途标签是否由配置源可靠提供，再拆 Requirement/Task。若远程/自定义模型无法可靠分类，不能静默过滤，只能采用推荐标签或分组。

## 后续 Task

- 决策后拆“模型选择作用域与工作区模式提示”Task；覆盖新会话默认、已有会话更改、正在生成时更改，以及模型能力差异呈现。
