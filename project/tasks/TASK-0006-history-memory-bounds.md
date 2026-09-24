---
id: TASK-0006
type: task
status: done
priority: P1
owner: runtime-node/runtime-core/apps/desktop
requirement: REQ-0002
plan: PLAN-0002
execution: parallel
branch: forge/dev
worktree: unassigned（与 TASK-0004 前例一致，直接在 forge/dev 主工作区串行执行；期间 TASK-0005 Worker 并行改 packages/coding-agent，路径无交集）
base_commit: forge/dev
read_paths: [packages/runtime-node, packages/runtime-core, apps/desktop]
write_paths: [packages/runtime-node, packages/runtime-core, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0004]
conflicts_with: []
integration_status: integrated
created: 2026-09-22
updated: 2026-09-22
---

# 长会话历史与事件缓冲上限

## 目标

限制完整 JSONL 读取、Runtime Event Relay、Renderer Projection、Tool/MCP 结果和 Team 子会话造成的累积内存增长。

## 必须保持

- Conversation/Event Log 仍是恢复事实；
- 事件顺序、terminal event 和旧会话读取保持兼容；
- 不以丢失恢复事实换取表面内存下降。

## 验收

长流、长会话、Renderer reload、Session switch 和重复 dispose 场景下，缓冲有界且能恢复。

## 实施摘要（2026-09-22）

按内存增长源逐点落地，全部保持既有恢复与冲突语义：

- **JSONL 完整读取（长会话）**：`FileConversationRepository` 的 `append`/`execute` 原本每次全量重读并
  重放整份会话文件（document 还会被重放两次）。新增 `ConversationWriteCache`（LRU，`documentCacheLimit`
  缺省 16）：文件锁内以 stat 字节数为失效键复用已解析 document 与事件计数，追加只处理新事件；会话文件
  经本仓库只增不减，任何外部写入都改变字节数并自动回退全量读取，版本冲突、损坏检测、旧 schema
  只读语义不变；`continueConversation` 直写源文件后丢弃缓存，`close()` 清空缓存。
- **Runtime Event Relay（长流）**：`RuntimeHostSessionEventRelay` 的 in-flight 回放缓冲新增事件数上限
  （缺省 4096，`RuntimeHostOptions.inFlightReplayEventLimit` 可配置）。超限丢最旧事件、重连订阅只回放
  尾部；事件顺序与 sequence 不变，`message.final`/`agent_end`/下一轮 `agent_start` 照常清空。Provider
  流事件的 `partial` 是同一对象引用（原地变更），上限约束的是 delta 串总量这条无界轴；恢复事实仍在
  JSONL 与 `message.final`。
- **MCP 结果（传输层）**：Modern HTTP 客户端单响应上限 `maxResponseBytes`（缺省 64 MiB，含 content-length
  预检、流式读取中途取消、SSE 订阅流单事件缓冲上限）；stdio 进程单条消息上限 `maxMessageBytes`（缺省
  16 MiB），超限报协议错误并终止对端进程，错误信息只保留 200 字符现场。超限 fail-fast 而非静默截断。
- **Renderer Projection（Session switch / reload）**：`turnStatsCache` 由只增 Map 改为 LRU 上限 128
  （`rememberTurnStats`）；`planModeStateBySessionAtom` 在观察回落 `default` 且无已提交计划时删键
  （「没有记录即视为未开启」，带计划的条目保留供计划面板回看）。

## 已知风险与后续项（超出本任务 write_paths 或需独立合同变更）

- **Team 子会话结构性常驻**：成员/协调 runtime session 与 `TeamSessionStateRepository.sessions` 在 team
  session 删除前不释放，且不受交互式会话空闲逐出（`IDLE_RESIDENT_SESSION_LIMIT`）覆盖；每成员
  `deliveredEventIds` 只增不减并随状态持久化——去重源是整个协调会话投影（`projectPublicContext`），
  裁剪需要先给投影加窗口，属 `packages/agent-team` 合同变更，建议单独立 Task。
- **Tool 结果持久层无统一大小兜底**：产品工具经 coding-agent 50KB 内联 + artifact 策略约束，但
  extension/插件工具结果可无上限进入 JSONL 与内存 document；统一上限需配合 artifact 化策略
  （`packages/runtime-desktop` / `packages/coding-agent`）另立任务。
- **渲染端全量 transcript**：`chatMessagesAtom` 与 `getFullHistory` 仍为全量（DOM 已虚拟化、切会话即清）；
  窗口化 + 上滑加载是需要 IPC/产品交互变更的独立特性。逐事件缓冲（delta flush、ConversationProjection）
  已受 100ms flush 定时器与归属闸门约束，确认有界。
- 渲染端 `suggestionTokenRef`/`turnStartDispatchSeqRef` 每会话两个数字的慢增长未处理（无干净的会话
  关闭信号，量级可忽略）。

## 验证

- `packages/runtime-core` relay 测试 5/5（新增上限裁剪、tail 回放保序、message.final 清空、缺省上限、
  非法配置拒绝）。
- `packages/runtime-node` conversation 88/88、mcp 42/42（新增缓存一致性、外部写入失效、LRU 淘汰、
  超限响应/消息、真实 stdio 子进程超限终止）。
- `apps/desktop` 新增渲染端测试 4 例 + 相邻 compaction/plan-mode 回归 7 例全绿。
- Biome（315 文件）、架构守卫（boundaries/coding-agent-architecture/conversation-message-architecture/
  runtime-failure-contract 等 10 项）、root `tsgo --noEmit`、`tsc -p apps/desktop` 均通过。
- 环境说明：本机 shell 无 bun，check:quick 以等价命令逐项执行；为使 runtime-node/desktop 测试可解析，
  构建了 `@vetta/ai`、`@vetta/ssh-transport`、`@vetta/toolkit` 的 dist（产物未纳入提交）。
- 未运行：全量 `bun run check`（缺 bun）、E2E/实机 UI（无 UI 交互变更；内存收益依赖真实长会话观察，
  可结合 TASK-0004 性能快照验证）。`MarkdownContent.stable-blocks` 1 例失败与本任务无关（该组件不依赖
  本次改动模块，失败在本工作区先行存在）；18 个测试文件因 `@vetta-org/*` 包未构建无法收集，同为环境问题。
