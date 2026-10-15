---
id: TASK-0262
type: task
status: verifying
priority: P2
owner: packages/runtime-core
requirement:
plan:
source: BUG-0110（用户实机日志 2026-10-14(2).log）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0110]
execution: serial
branch: main
worktree:
base_commit: 9801e62fc
read_paths: [packages/runtime-core/src/kernel/turn-pipeline.ts, packages/runtime-core/src/kernel/context-compaction-committer.ts, packages/runtime-core/src/kernel/contracts.ts, packages/runtime-node/src/conversation/file-conversation-repository.ts, packages/agent/src/engine/run-agent-turn.ts]
write_paths: [packages/runtime-core/src/kernel/turn-pipeline.ts, packages/runtime-core/test/kernel/turn-pipeline.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0110-compaction-commit-version-race.md, project/bugs/README.md, project/tasks/TASK-0262-compaction-version-race.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 压缩提交前排空在途追加并刷新版本，消除与事件循环的版本竞态

## 目标

自动压缩提交读到的是提交时刻的真实会话版本，不再因与 pipeline 事件循环并发而间歇性 `VERSION_CONFLICT` 失败。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：无
- Branch：main
- Worktree：未拆出（串行小改）
- 集成负责人：Coordinator
- 集成顺序：与其他两个修复串行提交

### 做

- `TurnPipeline` 记录事件追加的在途链；压缩提交前加**排空屏障**，等同一 pipeline 的在途 append 完成——消除「agent 链上 checkpoint 回调 vs 事件循环体」共享 `state.version` 的竞态。
- 屏障之后**重新 `repository.load` 刷新版本**，再作为 `expectedVersion` 提交，对齐同文件 finalization 路径（`turn-pipeline.ts:687-688`）的既有模式。

### 不做

- 不新增 `ConversationRepository` 契约的冲突信号，不引入跨包错误码（本次不需要）。
- 不改 `RetryableCleanup` 与 `ContextCompactionCommitter` 的语义。
- 不处理跨实例写者（属 BUG-0100 的文件锁面）与 ac-fence hook 超时。

## Given / When / Then

- Given：会话正在流式输出，上下文越过阈值触发自动压缩，同时事件循环仍在追加事件。
- When：checkpoint 回调发起压缩提交。
- Then：压缩以排空后刷新的版本提交并成功落盘；无并发时行为不变。

## 必须保持

- 压缩边界事件的落盘语义与事件顺序不变。
- `reason: 'manual'` 压缩不发失败观测的既有行为不变。
- 取消/中断路径的既有语义不变。

## 测试与验证

- 定向测试：`bun run test:pkg runtime-core`（`turn-pipeline.test.ts`）。
- 红基线：构造「事件追加在途时触发压缩」时序，旧实现抛 `VERSION_CONFLICT`。
- 质量检查：`bun run check` + `test:impact`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行。
- 人工功能验收：不适用（时序竞态，以确定性测试替代）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：长会话持续输出至超过上下文阈值。
- 操作步骤或 AI 任务输入：继续对话触发自动压缩。
- 预期行为与最终产物：压缩成功、上下文收缩；日志无 `Failed to persist context compaction`。
- 不通过表现与已知限制：压缩失败并记录版本冲突；跨实例并发写仍未覆盖。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：`turn-pipeline.ts`（`serializeAppend` 串行链；压缩提交、会话续接、终态追加三个持久写入点全部入队）、`context-compaction-committer.ts`（拆 `appendEvent`（只写）/`settle`（发布+通知+读文档），`commit` 保持原行为供手动压缩路径）。
- 评审修正（2026-10-15 收编）：① 终态路径原稿绕过串行链（取消/超时时 BUG-0110 竞态原样保留），已入队且发布/通知留锁外；② 临界区不再横跨事件发布与观察者通知（自锁不变量由注释级变为结构性保证），并去掉每次压缩的无条件全量 load——改为镜像版本乐观提交、命中类型化 `conversation_version_conflict` 刷新一次重试（测试替身同步按仓储合同抛类型化错误码）；③ 会话续接闭包后回写 `state.version = result.sourceVersion`（原稿漏写，续接后排队 append 确定性冲突）。
- 实际运行：定向 `turn-pipeline.test.ts`（含 BUG-0110 竞态红测与在途追加落定用例）等 runtime-core 7 文件 96 例全绿；包内 tsgo 构建通过。
- 未运行及原因：真实 Provider 长会话压缩间歇失败未实机复现（BUG 原始证据来自实机日志，回归以夹具竞态用例为准）。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：串行链 promise-tail 模式与仓内另两处（mutation-coordinator/runExclusive）重复，抽共享助手留待后续；finalization 的 reload 仍在锁外读版本（现有 idle gate 保护，评审复核为受控）。
