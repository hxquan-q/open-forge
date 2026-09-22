---
id: ISSUE-0006
type: issue
status: draft
priority: P1
owner: product/runtime
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
source: exprot/mvp-scope.md; exprot/runtime-mapping.md; TASK-0008
created: 2026-09-22
updated: 2026-09-22
---

# Conversation 何时升级为持久 Task

## 背景

历史合同要求简单请求仍走 Conversation，多步骤、需审批、长时间运行或产生多项结果的请求升级为 Task；Task 继续复用既有 Session/Turn，不自建 Agent Loop。当前文档没有定义“多步骤”的稳定判据，也没有说明由用户、产品入口还是模型提出升级。

## 已知事实

- Task 持久化和恢复有独立生命周期与 Activity projection；创建 Task 会改变 UI、事件记录与恢复语义。
- Task 状态只能由宿主/Runtime 合法转换，Agent 只能提出结构化建议。
- 计划与代码里均未为会话创建规定一个可测试、可回放的 promotion rule。

## 未决问题

普通用户输入一个较复杂的请求时，哪个条件会让系统创建 Task？创建后是否可以退回普通 Conversation？用户如何知道当前执行会被持久恢复？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 模型估算复杂度并自动升级 | 自然语言体验顺滑 | 需结构化判据与 Host 验证 | 相同请求可能因模型输出差异走不同生命周期 |
| B. 注册的持久工作流入口明确声明创建 Task，普通聊天仍为 Conversation | 判据可测试，行为可预测，便于先交付文档/批处理纵切 | 普通聊天中的隐式复杂请求不会自动升级 | 用户可能不知道如何启动持久任务，需清晰入口与升级提示 |
| C. 用户手动切换“Task 模式” | 用户控制最明确 | 增加输入流程与认知负担 | 用户可能忘记开启，导致需恢复的长任务只留在普通会话 |

## 推荐

第一阶段采用方案 B：只有明确注册为持久工作流的入口创建 Task；普通聊天保持 Conversation。模型可提出“需要转为 Task”的结构化建议，但由 Host 展示并确认后再创建，不能根据自由文本或 Prompt 私自切换。积累使用证据后，再决定是否增加可测量的自动升级规则。

## 决策触发条件

在 TASK-0015 设计 Task 创建 API/Activity 入口、TASK-0028 实现第一个文档工作流前确认第一阶段规则，并补入 REQ-0001 的 Given/When/Then。

## 后续 Task

- TASK-0015：Task 服务接受 Host 明确的 create/promotion 决策，不自行分类原始 prompt。
- TASK-0028：首个注册工作流验证 Task 创建、执行与恢复闭环。
