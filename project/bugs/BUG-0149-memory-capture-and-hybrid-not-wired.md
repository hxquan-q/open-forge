---
id: BUG-0149
type: bug
status: fixed
priority: P1
owner: apps/desktop / packages/coding-agent
source: VERIFY-0022 R5（2026-10-23 复核）
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0027]
related_tasks: [TASK-0390]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 自动捕获与混合检索未进入生产装配

## 现象

composition 工厂仅创建 store/index/erasure、显式工具与 context provider；未注册 capture observer、消费队列/启动补偿或抽取建议提交；工具 search 直走 Lexical，context 只读当前 projectScope 列表——HybridMemoryRetriever、向量通道、预算分配与 user+project 合并均未接线。

## 修复合同

- 已提交会话事件→捕获队列→消费→抽取建议校验→事务提交；覆盖启动补偿、幂等、取消、失败重试、预算与处理期间遗忘。
- 工具搜索与上下文注入走混合检索与预算分配；合并 user 与当前 project；无模型时明确降级词法。
- 模型能力经注入边界装配（不因费用门禁跳过接线）；确定性 Provider/embedding 替身只用于证明接线，不冒充真实模型质量。

## 回归要求

automatic 事件→队列→抽取→提交→下一次召回；user 偏好与 project 证据共同进入有界上下文；遗忘期间旧任务/向量/缓存不复活。

## 处置记录

- 2026-10-23：TASK-0390 修复完成——共享生产装配 session-assembly（coding-agent 可移植端口 + runtime-node 适配器）：捕获 observer→持久队列→预算抽取→事务提交→启动补偿；工具与上下文走混合检索与 user+project 合并注入预算；session-entry-flow 3 例经正常 Session 装配验证下一模型请求。
