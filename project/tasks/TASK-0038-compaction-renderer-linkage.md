---
id: TASK-0038
type: task
status: verifying
priority: P1
owner: packages/coding-agent + apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-4 / TASK-0034 contract
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation]
write_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation, docs/adr, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0051]
conflicts_with: [TASK-0035, TASK-0050, TASK-0051, TASK-0196]
integration_status: integrated（retain+验证收口，随本批推送 origin/dev）
created: 2026-09-23
updated: 2026-10-08
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

## 交付记录（2026-10-03，TASK-0196 批次）

### 范围裁决：现有实现已覆盖本任务主体（retain + 验证）

本任务立项于 09-23；此后压缩模块与渲染链持续演进，逐项对照结论：

| 合同项 | 现行实现（retain） | 证据 |
| --- | --- | --- |
| 成功压缩触发边界窗口重建 | **本次随 TASK-0051 落地**：任意触发原因的成功压缩 → head 合并刷新（旧页/锚点保留）→ 降级整窗替换 → 全量回载；占位降级由 TASK-0035/0050 视口机制负责 | useSessionEventController.compaction.test.tsx 两例（2d213eb3a） |
| 连续压缩 thrash 检测 | `CompactionBackpressureGate`：single-flight + 成功/失败双冷却 + 滞回带（真实压力尖峰可提前重试） | packages/coding-agent/test/compaction-backpressure.test.ts |
| 失败熔断与冷却后可恢复 | `failureCooldownMs` 冷却 + runtime-core 连续失败熔断器（compat 封装）；overflow 恢复路径按 `recoveryAttempt` 限次 | 同上 + automatic-compaction-strategy.ts overflow 分支 |
| 溢出尺寸种子 | overflow 触发 urgent 压缩（绕过冷却仍受 single-flight）；`recordEstimatedTokens` 记录装配估算；token-policy 对 CJK/宽字符保守估token，防单批工具结果跳过阈值直撞溢出 | automatic-compaction-strategy.ts:91-133、token-policy.ts |
| 失败/取消不重置投影、终态语义 | 控制器仅 success 重建；非手动失败只对 manual 弹提示 | compaction 测试族 |

### 实际运行

- `run-vitest` 定向压缩族 6 文件：56 通过 / 2 跳过（跳过项为 `ANTHROPIC_OAUTH_TOKEN` 门控的真实 LLM 摘要用例，本批不访问真实 Provider，正确保持跳过）。
- 渲染联动证据见 TASK-0051 交付（定向 5/5、impact 5+90、完整 check）。

### 实际修改

- 无代码变更（纯 retain+验证收口；渲染联动增量已随 TASK-0051 交付并引用）。

### 未运行及原因

- 真实 LLM 摘要质量用例：需要 Provider 凭据（任务边界），保持环境门控跳过。
- Renderer privateBytes 实机对比：不做实机验证（批次边界）。

### 剩余风险

- 「溢出尺寸种子」在现行架构中表现为 urgent 通道 + 保守估算 + 装配量记录，无独立的种子数据结构；若后续压缩阈值需自适应学习，另行立项。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：在主检出（HEAD `3f6e62262`）复跑本任务声明的压缩侧套件与渲染端联动用例。本任务无独立用户入口，真实 UI 需要一条真正走到压缩条件的长会话，本轮未驱动。

| 合同条款 | 本次读数 |
|---|---|
| 成功压缩 → Renderer 按既定边界合同重建有界窗口、保留阅读锚点 | `useSessionEventController.compaction.test.tsx` **1 文件 / 5 例通过**（自动压缩成功后边界条目可见；手动压缩重建保留已加载旧页） |
| 连续压缩 thrash 检测（`CompactionBackpressureGate`：single-flight + 成功/失败双冷却 + 滞回带） | 压缩族 **8 文件 / 56 通过 \| 2 跳过**：`compaction`、`compaction-backpressure`、`compaction-configuration`、`compaction-prefire`、`compaction-prefire-cache`、`compaction-work-state-recovery`、`compaction-extension-adapter`、`compaction-extensions-example` |
| 失败/取消不扰动当前历史；失败熔断与溢出尺寸种子 | 同上套件内（`compaction-configuration` 覆盖参数面口径） |

- **未覆盖**：真实的「长会话跑到压缩」端到端。合同写的「使用窗口化 transcript 的长会话达到压缩条件」需要一条真实长上下文会话（真实模型 + 大上下文），本轮未驱动；因此读数的**正确性**当前只有单测级证据，没有用户面证据。
- **关闭建议**：三条合同条款在测试级均成立、且交付记录与实现一致，倾向 `done`；是否要求补一次真实压缩会话，请用户裁定。
