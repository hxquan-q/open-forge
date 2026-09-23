---
id: TASK-0033
type: task
status: verifying
priority: P1
owner: packages/coding-agent
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-1 实施中发现（TASK-0032 遗留跟进）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/execution, packages/coding-agent/src/composition]
write_paths: [packages/coding-agent/src/execution, .github/release-notes]
exclusive_paths: [.github/release-notes]
depends_on: [TASK-0032]
conflicts_with: []
integration_status: integrated（forge/dev 工作区，未提交；与 worktree 提交 6a267ea 内容一致）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 会话执行运行时核心工具的结果策略旁路

## 目标

`CodingAgentSessionExecutionRuntime.createModeRegistry`（execution/session/runtime.ts:249-256 一带）创建 registry 时未注入 resultPolicy，默认 PRESERVE——产品会话中 bash/read/write/edit/task_output/task_stop 等核心工具的结果不在 50KB+artifact 预算内，属 TASK-0032 封堵的两条旁路之外的同型旁路。

## 方案边界

- 必须在 TASK-0032 已确立的图片语义之上评估：read 截图预览依赖「准入内图片内联」，套用策略后 8MB/24MB 内截图照常显示，超准入省略——先写用例证红再动；
- read/write 的 diff details 是 UI 重要字段，验证 64KB details 预算下 diff 展示不回退；
- 注入点：peripheral-assembly 实例化处传入同一 `codingToolResultPolicy`。

## 测试

read 大文本截断+artifact 引用、截图准入内联保留、diff details 保留、bash 长输出截断。

## 并发评估

- 结论：条件支持；与无重叠写路径的 coordination-only Task 可用独立 Worktree 并行，但本次选定在 `forge/dev` 主工作区串行执行。
- 执行方式：serial；当前不创建 Worktree。
- 可并行 Task：暂无已分派任务；可与仅写 `project/tasks` 的 `TASK-0034` 并行，但须由 Coordinator 建独立 Worktree 并单独集成 Release Notes。
- 前置依赖：`TASK-0032` 已完成。
- 冲突文件/独占路径：`packages/coding-agent/src/execution`、`.github/release-notes`。
- Branch：`forge/dev`；Worktree：unassigned（共享工作区串行）。
- 集成负责人：coordinator。
- 集成顺序：确认主工作区无同路径并行写入 → 实施 → 运行影响测试与质量门禁 → 更新 Task 交付记录。

## 交付记录

- 实际修改：`peripheral-assembly.ts` 透传 `codingTools.resultPolicy`，`CodingAgentSessionExecutionRuntime.createModeRegistry` 注入同一 `codingToolResultPolicy`，并以用户流程测试覆盖 read 大文本截断及 artifact 引用、图片内联、diff details 和 bash 长输出。
- 实际运行：`bun run --cwd packages/coding-agent test test/runtime-core/session-execution-result-policy.test.ts test/features/artifacts/artifact-version-policy.test.ts`，10 项通过；其中 TASK-0033 定向合同测试 6 项通过。
- 未运行及原因：完整 `bun run check` 尚未运行，待本批任务集成后统一执行。
- Release Notes：内部修复候选文案留存于此；当前仍处于继承的 Vetta v0.5.59 发布线，依 ISSUE-0007 门禁不修改该文件。
- 剩余风险：等待整批集成后的完整质量检查。
