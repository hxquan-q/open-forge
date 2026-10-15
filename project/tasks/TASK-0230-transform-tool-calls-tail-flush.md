---
id: TASK-0230
type: task
status: verifying
priority: P1
owner: packages/ai
requirement:
plan:
source: BUG-0095（transformMessages 尾部孤儿 tool_calls 不冲刷，严格 provider 永久拒会话）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0095]
execution: serial
branch:
worktree:
base_commit: 96f3ae527
read_paths: [packages/ai/src/providers/transform-messages.ts, packages/ai/test/transform-messages-model-input.test.ts, project/bugs/BUG-0095-transform-orphan-tool-calls-tail.md]
write_paths: [packages/ai/src/providers/transform-messages.ts, packages/ai/test/transform-messages-orphan-tool-calls.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0095-transform-orphan-tool-calls-tail.md, project/tasks/TASK-0230-transform-tool-calls-tail-flush.md, project/tasks/README.md]
exclusive_paths: [packages/ai/src/providers/transform-messages.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# transformMessages 尾部孤儿 tool_calls 补合成结果

## 目标

二遍对账的不变量补全：「离开 transform 的消息流不出现无结果 tool_call」。循环结束后 `pendingToolCalls` 非空时按既有合成格式补尾。

1. **尾刷**：for 循环结束后调用同一冲刷逻辑，为仍缺 `toolResult` 的 `toolCallId` 追加合成 `toolResult`（`isError:true`、文本 `"No result provided"`、`toolName` 取调用方）。
2. **复用**：把 assistant/user 分支里两处重复的冲刷块收敛为单一局部 helper，三处调用同一实现，不引入行为差异。
3. **不改语义**：中段冲刷时机、toolName 归一、aborted/error assistant 跳过、ID 归一化全部原样保留。

## 约束

- `packages/ai` AGENTS：消息转换属协议合同级，成功/畸形/边界路径必测；不跑 `test:live`。
- 合成消息形状与现有两处完全一致（`timestamp: Date.now()`、`as ToolResultMessage`）。
- 不追究上游生产者（中断回合/裁剪），transform 作为最后防线兜底即可。

## 验收（Given/When/Then）

- Given：历史以「带 toolCall 的 assistant」结尾、无 toolResult → Then：输出末尾追加对应 `toolCallId` 的 `isError` 合成 toolResult。
- Given：尾部 assistant 带两个 toolCall、其中只有一个有结果 → Then：只为缺失 id 合成。
- Given：中段孤儿调用后随 user 消息 → Then：既有中段冲刷不变（防回归）。
- Given：旧实现 → Then：尾部用例列表仍以 toolCall 结尾（红基线）。

## 交付记录

- 红基线：新测试 4 例中 2 例尾部断言失败（`result` 仍含末尾 toolCall / 缺 call_2 合成结果），中段冲刷与 aborted 跳过 2 例通过——确认漏网面只在尾部。
- 实际修改：`transform-messages.ts` 二遍——两处重复冲刷块收敛为 `flushPendingToolCalls()` 局部 helper（合成 toolResult 形状逐字段不变：`role`/`toolCallId`/`toolName`/`content`/`isError`/`timestamp`），assistant/user 分支改调 helper，循环结束后无条件尾刷。
- 测试：`transform-messages-orphan-tool-calls.test.ts`（新文件）4/4 过；相邻 `transform-messages-model-input`/`copilot-openai-to-anthropic` 套件同绿；ai 包全量 520/520；impact（transform-messages.ts）42 文件 384 例过。
- 检查：root `tsgo --noEmit` + ai `tsconfig.build.json` 绿；`check:lint` 绿（biome 自动格式化过一次新文件空白）。
- 未运行：`bun run check` 全量（`.ua/` 既有 guard 残留会红，与本次无关）；desktop/其他包无消费面变化（transform 输出签名不变）。
