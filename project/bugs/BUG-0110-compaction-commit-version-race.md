---
id: BUG-0110
type: bug
status: verifying
priority: P2
owner: packages/runtime-core
requirement:
plan:
source: 用户提供的实机日志（2026-10-14(2).log，main 9801e62fc）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 上下文压缩提交与事件追加并发共享 state.version，压缩持久化间歇性版本冲突失败

## 用户流程

- Given：一个正在流式回复的会话，上下文超过阈值触发自动压缩。
- When：agent 链上的 checkpoint 回调发起压缩提交，同时 pipeline 的事件循环仍在追加助手消息/工具结果事件。
- Then：期望压缩边界事件落盘并继续该轮；实际偶发 `Failed to persist context compaction: … is at version 1067, expected 1066`，压缩失败、上下文未收缩。

## 实际行为

`2026-10-14(2).log`，会话 `9a222d82-bb89-4de1-a5f4-5de153cadc25`：

```
info  [agent-runtime] context compaction started { contextTokens: 104565, thresholdTokens: 102400, usagePercent: 81.69 }
warn  [agent-runtime] context compaction failed { success: false, durationMs: 113,
        errorMessage: 'Failed to persist context compaction: Conversation 9a222d82-… is at version 1067, expected 1066' }
```

同一会话另一次压缩耗时 178806ms 后 `success: true`——说明该路径平时可用，冲突是间歇性的。

## 期望行为

压缩提交读到的是提交时刻的真实会话版本，压缩边界事件成功落盘；即使发生并发追加，也不应把版本冲突暴露为压缩失败。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\vetta\open-forge`），Windows 11，Electron 39.8.10。
- `2026-10-14(2).log`：`context compaction failed` 与 `Conversation 9a222d82-… is at version 1067, expected 1066` 成对出现；`durationMs: 113`（快路径、竞争窗口最短）。
- 该会话同窗口另有文件锁竞争记录，与「输给在途 append」的推断一致。

## 最小复现

1. 让会话上下文超过压缩阈值，触发 `reason: 'threshold'` 的自动压缩。
2. 使压缩提交与 pipeline 的事件追加循环在时间上重叠（持续流式输出即可）。
3. 观察 `commitCompaction` 以陈旧的 `state.version` 提交，命中 `VERSION_CONFLICT`。

## 影响

压缩失败使上下文继续膨胀，可能连锁触发下一轮压缩与更高的 token 消耗；在团队会话中压缩失败还会拖长成员回合，与 BUG-0109 的续跑失败叠加。

## 根因证据

- 同一会话存在两个并发写者，共享 `MutableTurnState.version` 内存镜像却无串行化：
  - pipeline 事件循环体：`turn-pipeline.ts:999-1000` 的 `repository.append(state.sessionId, state.version, events)` 后更新 `state.version`；
  - agent 链上的 checkpoint 回调：`turn-pipeline.ts:577-590` 传入 `prepareContextCheckpoint` → `commitCompaction`（`:824-854`）以 `expectedVersion: state.version`（`:835`）调用 `contextCompactionCommitter.commit`（`context-compaction-committer.ts:56` 直接 `repository.append`）。
- agent 的 `emit` 是非阻塞 push（`packages/agent/src/engine/run-agent-turn.ts:381-382`、`packages/ai/src/utils/event-stream.ts:45-60`），不等待消费；`run-agent-turn.ts:187` 在发出 `assistant_message` 后立刻 `await checkpoint(...)`，于是压缩提交与循环体的在途 append 重叠。
- 冲突在仓储锁内校验并抛出：`file-conversation-repository.ts:383-389`（`state.eventCount !== expectedVersion`）。
- **对照**：同文件 finalization 路径（`:687-688`）在 append 终态前先 `repository.load` 再刷新 `state.version`，因为它运行在 `for await` 循环结束之后、无并发写者；压缩运行在循环进行中，因此缺少同等保护。
- 全仓 `conversation_version_conflict` 只有抛出点与错误码定义，没有任何 catch/重试。
- 置信度：高（并发时序、非阻塞 emit、缺失的版本刷新三点互相印证）。

## 回归测试

`turn-pipeline` 级：构造「事件追加在途时触发 checkpoint 压缩」的时序，断言压缩以刷新后的版本提交并成功；旧实现在该时序下抛 `VERSION_CONFLICT`。同时覆盖正常（无并发）压缩路径不回归。

## 修复与验证

- 修复：待实施（见 TASK-0262）。
- 测试：待回写。
- 检查：待回写。
- 未运行及原因：待回写。
