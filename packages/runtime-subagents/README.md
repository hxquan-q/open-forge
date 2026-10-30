# Runtime Subagents

`@vetta/runtime-subagents` 是与产品和宿主无关的子代理调度内核。

## 职责

- 管理子代理身份、状态、快照和恢复状态；
- 执行 FIFO 排队和并发限制；
- 通过 Child Factory/Handle 驱动创建、继续、打断和释放；
- 执行子代理生命周期钩子；
- 协调 `wait` 与自动通知之间的恰好一次交付。

## 非职责

- 不创建 Coding Agent `RuntimeSession`；
- 不加载模型、Tool、MCP、Skill、知识库或上下文；
- 不持久化 Conversation；
- 不定义 `explorer`、`workflow` 等产品 Profile；
- 不认识 Todo 等产品 Session Extension 的初始化、订阅或投影字段；
- 不生成包含具体工具名的模型可见提示文本。

上述能力由产品组合层和对应 Runtime 包实现。`runtime-subagents` 通过
`SubagentChildFactory`、`SubagentLifecycle` 和观察回调接收这些能力。

## 内部结构

- `SubagentCoordinator`：公开端口门面和依赖组合；
- `SubagentDispatcher`：跨子代理准入、批量派遣和终态补位；
- `SubagentRun`：单个子代理状态、Child Handle 和生命周期的唯一所有者；
- `SubagentPool`：记录索引、并发槽位和 FIFO 队列的统一所有者；
- `recovery`：恢复数据的纯校验与规范化；
- `SubagentDelivery`：generation 交付声明、等待者和通知批次；
- `SubagentTypeRegistry`：运行时可变的子代理类型目录。

子代理执行是长生命周期并发状态机，不是线性管道。无状态的数据投影可以使用管道组合，状态转换则必须由上述单一所有者维护。

## 准入与释放观测

`SubagentCoordinatorOptions.onSchedulingEvent` 可选接收排队、准入、容量拒绝、取消收尾、收尾宽限到期和逻辑槽释放的安全事件；同步异常和异步拒绝均不影响调度。事件包含并发/队列计数、等待/持有时长及稳定身份，不包含任务名、正文、输出、路径或错误原文。

每次执行以 `admissionId` 关联，真实 Child Handle 绑定后才附 `childSessionId`；启动前的 pending ID 含调用者任务名，不用于诊断。`generation` 保留快照的交付代际语义，在终态提交时递增，因此同次准入与释放可能不同，应按 `admissionId` 关联。

`released` 表示逻辑调度名额归还；`reason: settle-deadline` 明确表明有界收尾宽限耗尽，不能据此断言底层进程/Provider 已退出。默认并发 3、单次 spawn 拒绝、批量 FIFO 和默认 10 秒收尾宽限保持不变。产品通过 callback 接 observation publisher，本包仍无 workspace 依赖。

架构守卫要求 Coordinator 不得直接操作 Child Handle 或修改 Snapshot 状态，并阻止已退役的 Store/Scheduler/Internal 所有权文件重新出现。

## 验证

在本包目录运行 `bun run test`。仓库质量门禁还会检查本包的 workspace
依赖和工具协议残留，防止产品实现反向进入调度内核。


## Context Boundary

```yaml
purpose: Subagent runtime contracts for child agent session orchestration
provides:  
  - "@vetta/runtime-subagents"
consumes:  []
internal_dependencies:  []
```
