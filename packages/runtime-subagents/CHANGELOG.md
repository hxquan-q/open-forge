<!-- Modified by The Open Forge contributors. -->
# Changelog

All notable changes to `@vetta/runtime-subagents` are documented in this file.

## [Unreleased]

### Changed

- 移除 Spawn Request、Child Handle 与 Snapshot 中的 Todo 初始化、订阅和进度字段；产品扩展通过自身端口投影附加状态。
- 新增可持久化的 terminal/batch 自动交付策略；批次成员全部进入终态后才一次通知，同时继续复用 generation claim 保证 wait 与自动通知不会重复消费。

- 将协调器收敛为公开门面，新增 Dispatcher、Run、Pool 和纯 Recovery 所有者，并把 wait 完整归入 Delivery。
- 初始子代理消息投影改为可由产品组合层注入，同时保留默认投影兼容行为。
- 将子代理记录、FIFO 调度和 generation 交付拆分为独立状态所有者，协调器只负责编排异步生命周期。
- 调度内核改为交付终态快照，不再生成包含具体工具名的模型可见通知文本。
- 收紧协调端口的只读参数和事件类型，并移除没有生产消费者的工具描述接口。

### Fixed

- 修复 stop hook 与 interrupt/dispose 竞争覆盖终态、hook 异常占死槽位、reopen 后才检查容量、异步 abort 提前补位、重复 Child ID 覆盖和观察回调破坏调度状态的问题。
- `SubagentChildEvent` 的 `agent_end` 现在可携带 `reason`（`completed`/`failed`/`interrupted`）与 `errorMessage`/`errorCode`；成员 Turn 失败或被外部中止不再被误记为 `completed`，失败事实随终态快照投递给父级。
- 新增 `startDeadlineMs`/`settleDeadlineMs`（默认 30s/10s，传非有限值恢复无限等待）：子会话创建/重开、中断收尾（abort→idle→stop 钩子）与子句柄释放全部有界，忽略 AbortSignal 或悬挂的 Child 不再占死并发槽位、挂死 `spawn`/`followUp`/`dispose`。
