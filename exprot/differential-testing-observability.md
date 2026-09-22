# 差分测试与可观测性基线

## 1. 目标

从 MVP 第一阶段维护一套与具体 Agent Engine 无关的行为合同。当前只验证 Vetta Engine；未来 Pi Adapter 接入时复用同一套 fixture 做差分测试。

测试的是可观察合同，不锁定私有实现和偶然调用顺序。

## 2. 核心行为矩阵

| 场景 | 必须验证 |
|---|---|
| 纯文本完成 | assistant message、stopReason、终态事件 |
| 单 Tool | schema validation、policy、参数、content/details |
| 多 Tool | toolCallId 关联、顺序、跳过和结果持久化 |
| Tool 拒绝 | Approval/Policy 结果、模型可见错误、Task 状态 |
| Tool update/phase | execution observation、UI details、不进入模型 content |
| Provider error | failure code、origin、retryable、终态 |
| 取消 | AbortSignal、partial assistant salvage、turn.cancelled |
| steering | 队列消费、剩余 Tool skip、事件顺序 |
| follow-up | continuation、额外模型调用、Task projection |
| checkpoint | compaction、recovery、retry 和消息身份 |
| generation | 活动 Turn 保留旧能力，下一 Turn 获得新能力 |
| MCP deferred | index、tool_search、激活和下一模型调用可见性 |
| Task | 合法/非法状态转换、重启恢复、人工接管 |
| Artifact | 版本、引用、checksum、Review、文件缺失 |
| Trust | scope、过期、撤销、项目隔离 |
| crash recovery | JSONL 重放、重复事件、终态补写 |

## 3. Engine 差分合同

未来 Pi Adapter 必须与 Vetta Engine 在同一个输入 fixture 上比较：

```text
Input messages
Snapshot id/generation
Model stream fixture
Tool catalog
Tool policy
Queue input
Checkpoint response
Abort timing
```

比较：

- Message 序列和角色；
- Tool call/result 关联；
- stopReason；
- failure projection；
- cancellation semantics；
- usage/cost；
- observation 类型和身份；
- repository 最终事件；
- Task/Artifact projection。

如果 Adapter 只能通过改变 Runtime 合同才能通过测试，则暂不接入生产。

## 4. 用户流程测试

### work

```text
创建 work Task
  → 计划审批
  → 读取多个本地文件
  → 生成 document/dataset/analysis Artifact
  → Review
  → 保存结果
  → 重启后仍能查看 Task 和 Artifact
```

### coding

```text
创建 coding Task
  → 选择项目
  → 读取项目上下文
  → 生成修改计划
  → 审批高风险操作
  → 写入 Diff
  → 执行测试
  → Review Patch/Test Result
  → 取消或失败后恢复
```

## 5. 观测事件

至少提供以下维度：

- `sessionId`、`taskId`、`turnId`、`snapshotId/generation`；
- model call index/callId；
- toolCallId/toolName/risk level；
- approvalId/decision/scope；
- artifactId/version/status；
- start/end/duration；
- stopReason/failure code/retry count；
- queue wait time；
- prompt/tool count 和 token usage；
- cache hit/miss；
- cancellation source；
- resource release result。

观测失败不能改变主 Turn 结果，敏感输入不能进入日志。

## 6. 质量门禁

从仓库根目录使用：

```bash
bun run check:quick
bun scripts/quality/run-vitest.mjs --run <相关测试文件>
bun run check
```

不运行裸 `bun test`。不运行真实 Provider；Provider live test 只有在获得明确授权后才考虑。

实现 Task/Artifact/Permission/IPC 合同时，至少运行：

- runtime-core 合同测试；
- coding-agent 产品组合测试；
- runtime-tools Tool 合同测试；
- Desktop IPC/Renderer 定向测试；
- package boundary/coding-agent architecture guard；
- 持久化恢复和生命周期测试。

## 7. 性能基线

### 当前实测基线

- 原版 Desktop `0.5.58` 在 Windows x64 上出现 DeepSeek Responses 流协议错误：`response.content_part.added targeted the wrong output item`；该错误必须被稳定投影为 Provider failure/Team member terminal state。
- Agent Team 日志出现约 248 秒成员 Turn、约 34–43 秒 Compaction，以及约 57 秒 continuation；测试不能只验证最终成功，还要验证长尾、取消和压缩失败后的终态。
- App Monitor 汇总的 compaction 计数与主日志不一致；观测合同需要验证主流程事件和聚合指标的一致性。
- Desktop 性能现场快照至少记录 Main/Renderer/GPU 子进程、Working Set/Private Bytes、V8 Heap、GPU memory/utilization、WebGL context、EventBuffer、Queue wait、Compaction、Provider 和 Tool duration。
- 高负载视觉装饰（WebGL Shader、视频桌宠、后台截图窗口）需要可关闭、可暂停、可降级，并在 A/B 期间记录 GPU 与帧耗时；本轮已暂时移除星轨装饰球的生产注册，但保留组件接口。

记录但不预先优化：

- 首 Token 延迟；
- Tool turnaround；
- Task 完成耗时；
- approval wait；
- context token 数；
- prompt cache 命中率；
- 单 Task 模型调用数和成本；
- EventSink/IPC lag；
- 长会话内存；
- 重启恢复耗时。
