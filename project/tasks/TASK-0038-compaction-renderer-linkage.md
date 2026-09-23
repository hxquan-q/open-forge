---
id: TASK-0038
type: task
status: draft
priority: P1
owner: packages/coding-agent + apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-4 / TASK-0034 contract
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation]
write_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation, docs/adr, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0051]
conflicts_with: [TASK-0035, TASK-0050, TASK-0051]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# compaction 与渲染端驻留联动 + 防抖三件套

## 目标

压缩参数面已齐（`contracts.ts:82-87`、`backpressure.ts:30-34`）但渲染端投影驻留与压缩生命周期尚未联动。本任务负责 compaction 事件触发边界投影重放，以及压缩 thrash 检测、失败熔断和溢出尺寸种子；历史边界前后消息的保留/恢复规则由 TASK-0034 冻结，具体边界重放由 TASK-0051 实现。

## 范围

### 并发评估

- 结论：不支持并发；依赖 TASK-0051 完成边界重放，并与 Renderer compaction event 接线共享写路径。
- 执行方式：共享 `forge/dev` 工作区串行。
- 可并行 Task：无（transcript 链内）。
- 前置依赖：TASK-0034 合同、TASK-0051 边界重放实现。
- 冲突文件/独占路径：`packages/coding-agent/src/compaction`、conversation event/controller 与窗口投影、release note。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不建独立 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0035 → TASK-0050 → TASK-0051 → TASK-0038。
- 上下文/压缩合同如有改变，按仓库规则补 ADR；不能仅改 ADR 宣称行为已实现。

### 做

- 成功 compaction 事件触发 TASK-0051 定义的有界 Renderer 窗口重建；保持当前稳定消息锚点，释放非窗口内完整 blocks。
- 实现连续 compaction thrash 检测、失败冷却/熔断和溢出尺寸种子，并保证恢复后仍可继续正常压缩。
- 失败或取消压缩不重置当前投影；终态、取消和错误反馈保持既有语义。

### 不做

- 不改压缩触发参数（reserve 36k/空闲阈值 20%/保留最近 20k）。
- 不重新定义 boundary/summary 的展示、历史分页或重放行为；这些由 TASK-0034/TASK-0051 负责。
- 不删除或改写 JSONL 中任何用户可见历史。

## Given / When / Then

- Given：使用窗口化 transcript 的长会话达到压缩条件。
- When：压缩成功、失败、取消或连续触发。
- Then：成功时 Renderer 按既定边界合同重建有界窗口且保留阅读锚点；失败/取消不扰动当前历史；连续异常压缩被限制，不丢终态且不形成无限重试。

## 必须保持

- JSONL 仍是唯一事实源；摘要不取代任何旧消息，所有边界之前的消息仍可按页定位和展开。
- 压缩期间不闪断当前 UI，不丢焦点、滚动锚点或用户正在交互的消息。
- 背压、重试、取消及 `compaction.start/end` 事件终态严格保持；熔断只限制异常重复，不静默改变人工压缩语义。

## 测试与验证

- 定向：thrash 连续触发熔断、失败冷却结束后可重试、溢出种子更新、事件终态与 Renderer 边界重放集成。
- 用户流程：长会话浏览旧消息 → 触发 compaction → 保持当前位置并继续对话 → 展开 compaction 前旧消息；另外覆盖失败/取消不改变当前窗口。
- 性能：固定长会话 compaction 前后对比 Renderer `privateBytes` 峰值/稳态；不得以释放消息行或改写 transcript 冒充窗口化收益。
- 质量：`bun run test:impact -- <改动文件...>`、`bun run check:quick -- <改动文件...>`；完整实现轮结束后 `bun run check`，补当前版本 Release Notes。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
