---
id: TASK-0530
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 194cb8b64
read_paths: []
write_paths:
  - apps/cli-host/src/rpc/runtime-host/cli-session-assembly.ts
  - apps/cli-host/test/agent-runtime-selection.test.ts
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# cli-host 恢复会话时显式 --model 优先（上游 8e6d9dfe2）

## 合同

- 来源与目标：PLAN-0032 收尾后的基线外增量——手工合并上游 `8e6d9dfe2`「恢复会话时以显式 --model 为准」。上游 issue 场景：IM 桥接改模型后会带新的 `--model` 重启子进程，但同一聊天总以 `--session` 恢复旧会话，而恢复时按最后一条回复挑回原模型，命令行参数被覆盖——用户在设置里换了模型，已聊过的微信/飞书对话仍用旧模型。本地 `im-host/coding-agent-spec.ts` 同样以 `--model` + `--scenario im-claw` 重启子进程，`cli-session-assembly.ts` 与上游修复前形态逐字一致（`git diff upstream/dev` 仅差该修复与一致性头），缺陷在本地同样存在。该提交上游无后续漂移。
- 做（本任务）：
  - `cli-session-assembly.ts`：`sessionOptions` 增加 `parsed.model ? { model: options.initialModel, thinkingLevel: options.initialThinkingLevel } : {}`——显式 `--model` 压过按历史回复挑回的模型；未指定时保留按历史恢复语义。
  - `agent-runtime-selection.test.ts`：移植上游 RPC 集成回归测试「keeps the explicit --model when resuming a session last answered by another model」——构造上一模型回复的 jsonl 会话，带 `--session` 恢复 + 默认 test-model，断言 `get_state` 返回 test-model 而非 previous-model。fixture（createFixture/startRpc）本地同构直接合入。
  - release fragment 一份。
- 不做：telemetry 清理（21f04ae88，另案勘察中）；诊断包弹窗、跨版本更新说明（分叉大，另行立项）。
- 保留本地分叉：测试文件既有的 30s timeout 适配（`reused.close()` 后的 `, 30_000`）。
- Given / When / Then：
  - 会话最后一条回复来自 previous-model → 带显式 `--model`（test-model）+ `--session` 恢复 → `get_state` 返回 test-model，不回退到 previous-model。
  - 不带 `--model` 恢复 → 仍按历史回复恢复原模型（既有行为不变）。
- 验证：cli-host 定向测试 `test/agent-runtime-selection.test.ts`；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：无独立实机验收要求（RPC 集成测试覆盖端到端行为）。

## 交付

- 实际修改与验证（2026-11-27）：
  - 上游 `8e6d9dfe2` 按 patch 参照适配落地：`cli-session-assembly.ts` 条件展开 `parsed.model ? { model: initialModel, thinkingLevel: initialThinkingLevel } : {}`；`agent-runtime-selection.test.ts` 移植上游 RPC 集成回归测试（构造 previous-model 回复的 jsonl 会话，`--session` 恢复后 `get_state` 断言 test-model）。
  - 验证：红绿验证成立——回退修复后该用例必败（1 failed），恢复后全文件 10/10；`bun run test:impact -- cli-session-assembly.ts` 4 文件 23/23 全绿；`bun run check` 全绿。
  - verifier 复查 pass 无问题：与上游 hunk 逐行一致；`--model` 无法解析时在入口直接抛错不会传 undefined；生效点确认为 runtime-core `config.model` 有值跳过 `restoreModelFromHistory`；未显式传参时历史恢复路径不变；本地 30s timeout 分叉保留。
  - 未运行：无独立实机验收要求。
