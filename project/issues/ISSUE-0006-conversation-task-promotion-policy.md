---
id: ISSUE-0006
type: issue
status: done
priority: P1
owner: product/runtime
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
related_tasks: [TASK-0015, TASK-0028]
source: exprot/mvp-scope.md; exprot/runtime-mapping.md; TASK-0008; TASK-0015; apps/desktop/src/main/task-activity/task-activity-service.ts; apps/desktop/src/renderer/domains/activity-panel/builtins/task-tab.test.tsx; .github/release-notes/v0.5.59.md
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Conversation 何时升级为持久 Task

## 背景

历史范围把简单请求留在 Conversation，并把多步骤、需审批、长时间运行或产生多项结果的请求描述为升级为 Task；但没有定义“多步骤”的稳定判据，也没有说明升级由用户、产品入口还是模型触发。

## 已知事实

- Task 持久化和恢复有独立生命周期与 Activity projection；创建 Task 会改变 UI、事件记录与恢复语义。
- `TASK-0015` 已实现 Host 显式提交 Task 事实、绑定既有 Session/Turn 和事件恢复，不自建 Agent Loop；未实现自由文本分类。
- Desktop 的 Task 空态提供用户可点击的“升级为任务”入口，测试确认它对当前 Session 发送 `create` 命令；主进程创建 Task 时把该 Session 设为 `rootSessionId`。
- Task 命令没有把 Task 降级/删除为普通 Conversation 的转换；取消、失败、拒绝和完成由既有状态机记录，Activity Panel 可从持久化事件恢复状态。

## 裁决范围

普通用户输入复杂请求时是否自动创建 Task？显式创建后是否允许降级？用户怎样辨别该执行会持久恢复？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A. 模型估算复杂度并自动升级 | 自然语言体验顺滑 | 需要稳定判据与 Host 验证 | 相同请求可能因模型输出差异进入不同生命周期 |
| B. 注册的持久工作流入口明确创建 Task，普通聊天保持 Conversation | 判据可测试、行为可预测，适合按纵向切片交付 | 普通聊天中的隐式复杂请求不会自动升级 | 用户需要看见并理解持久任务入口 |
| C. 用户先手动切换“Task 模式” | 用户控制最明确 | 增加输入步骤和认知负担 | 用户可能忘记开启持久模式 |

## 决议（2026-09-23）

采用方案 B 的确定性边界，并保留当前已实现的显式升级入口：

1. 普通 Chat 一律保持 Conversation；请求看起来复杂、耗时或多步骤，本身不触发升级。
2. 只有用户明确点击“升级为任务”，或启动一个已注册的持久工作流时，Host 才发送 Task `create` 命令。模型不能根据自由文本自行创建 Task；本阶段也不增加模型发起的升级建议通道。若将来需要建议式升级，应另行定义可验证触发条件、用户确认和拒绝后的行为。
3. Task 绑定当前 Session，由 Runtime 在后续实际 Turn 上建立执行关联，不创建第二套会话或 Agent Loop。明确入口和 Activity Panel 状态让用户知道它是可恢复任务；重开会话后从事件记录恢复。
4. Task 不降级或删除为普通 Conversation。Task 完成、取消、失败或被拒绝只结束其生命周期，Task 事件和同一 Session 的对话历史保留；这不关闭或替换 Conversation。

因此，用户需要显式启动持久任务；代价是普通聊天里的长请求不会自动获得 Task 恢复语义。`TASK-0028` 可按此合同进入 ready，研究与数据分析仍受各自的 `TASK-0028` 前置依赖约束。

## 后续触发条件

只有当使用证据表明用户经常忘记显式升级，且产品准备接受模型误判与额外确认步骤时，才新增决策评估建议式升级；不得把历史上“多步骤即升级”的描述直接当作自动分类合同。

## 后续 Task

- `TASK-0015`：已完成显式 Task API、生命周期和 Activity 投影；不负责分类原始 prompt。
- `TASK-0028`：按本决议实现文档工作流（Work 右栏注册入口显式 `create`）。
