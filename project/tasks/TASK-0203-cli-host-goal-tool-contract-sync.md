---
id: TASK-0203
type: task
status: done
priority: P1
owner: coordinator
source: TASK-0197 复验（user-request 继续 test 驱动完善）；TASK-0156 目标特性合入 bc85cfc7b 后 cli-host 合同断言未同步
related_requirement: [REQ-0008]
related_plan: []
related_tasks: [TASK-0156, TASK-0197]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 9e3cede94032f17a2b9475c6de630409cb555616
read_paths: [apps/cli-host/test, packages/coding-agent/src/features/goal, packages/runtime-core/src/kernel, docs/adr/0144-goal-mode-is-a-session-extension.md]
write_paths: [apps/cli-host/test, project/tasks/TASK-0203-cli-host-goal-tool-contract-sync.md, project/tasks/TASK-0197-harness-absorption-batch.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行，随断言同步提交）
created: 2026-10-04
updated: 2026-10-04
---
<!-- Copyright The Open Forge contributors. -->

# 同步 cli-host 合同测试到目标特性工具面

## 目标与范围

TASK-0197 在本轮低竞争环境复验完整 cli-host 套件（51 文件 / 244 项）时确认 4 failed / 226 passed：`todo-runtime-contract.test.ts:89`、`runtime-composition-contract.test.ts:442`、`plugin-tool-runtime-contract.test.ts:144`、`plugin-runtime-contract.test.ts:106`。四例均为精确工具清单相等断言未随 TASK-0156（bc85cfc7b，ADR-0144）的无条件目标工具贡献（`get_goal`/`create_goal`/`update_goal`，modelOrder 2125/2150/2175）更新所致；已对照上游同源码确认该贡献为继承行为，非本仓回归。本 Task 只更新这四处（及复跑暴露的同因连带断言）的期望值，使合同断言重新锚定当前已合入的特性契约。

不做：不改动产品代码（目标工具无条件贡献为上游既定行为）；不删除/跳过断言、不延长时间超时、不放宽相等性；不重写断言结构，只同步期望值。

### 并发评估

- 结论：不支持并行（断言同步小修）
- 执行方式：serial
- 可并行 Task：无（`apps/cli-host/test` 与 `project/tasks` 均为共享写面）
- 前置依赖：无（TASK-0156 已合入）
- 冲突文件/独占路径：`apps/cli-host/test`（此前无其它泳道在途修改；`project/tasks` 与 TASK-0197 泳道共享，已登记 conflicts_with）
- Branch：main
- Worktree：无（主工作区串行，不拆独立树）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：本修复直接入 main；TASK-0197 恢复验证依赖本 Task 收口

## Given / When / Then

- Given main `9e3cede94` 合入 TASK-0156 目标特性；When 运行完整 cli-host 套件；Then 4 例工具清单相等断言因目标工具在场而失败，失败只存在于断言漂移而非行为错误。
- Given 断言同步为当前特性契约（含工具名与顺序、按 modelOrder）；When 复跑四个文件与完整 cli-host 套件；Then 全部通过，且未改动超时、未删除/跳过任何断言或用例。

## 必须保持

- 不使用 `run-vitest` 之外的运行方式；不 skip、不 only、不改 timeout。
- 被测产品的行为不动：`get_goal`/`create_goal`/`update_goal` 的无条件贡献保留。
- 精确清单断言的确定性：新期望值必须反映实际 modelOrder 排序（todo 2100 < getGoal 2125 < createGoal 2150 < updateGoal 2175；与其它工具的相对顺序依其序值），不能使用 `arrayContaining` 等模糊化替代以规避顺序验证。
- 文件许可证头与既有格式不变。

## 测试与验证

- 定向：4 个文件逐个 `bun ../../scripts/quality/run-vitest.mjs --run <file> --maxWorkers=1`；随后完整 cli-host 套件。
- 质量检查：`bun run check`。
- 复验纳入 TASK-0197 停止点要求：低竞争环境完整 cli-host + Desktop 完整范围。

## 验收分层

- 工程验证：通过（2026-10-04）。定向四文件、完整 cli-host（230 项）、Desktop 完整范围（4906 项）、`test:impact`（18 项，格式化修订后最终内容复跑）、完整 `bun run check`（exit 0）全部通过；修改声明头 ratchet new=0。
- 技术评审：自审完成——期望值来源逐项锚定：工具名与顺序来自 `createGoalTools` 与 `CODING_AGENT_MODEL_TOOL_ORDER`（kernel `orderTools` 按 modelOrder 排序、无序工具按贡献序）；描述与 schema 字面量来自 `features/goal/tools.ts` 源码；`description` 调用理由属性来自 `coding-agent.call-description` 投影器（`ToolCallDescriptionSchema`）；`activeToolNames` 的实际顺序按运行失败差异逐值核对后钉死，未使用模糊匹配。
- 集成：integrated（main 主工作区串行，随断言同步提交）。
- 人工功能验收：不适用（测试合同同步，无用户可见行为；完成标准为套件全绿且零遮蔽，已达成）。
- 发布：未授权且无产品可见变化，不改发布说明（对照 TASK-0201/0202 先例）。

## 验证进展（2026-10-04）

- 定向：四个文件修改后逐个复跑——todo-runtime-contract 2/2、plugin-runtime-contract 1/1、plugin-tool-runtime-contract 1/1、runtime-composition-contract（`-t` 过滤目标用例）1/1 全绿。
- 完整 cli-host 套件（包内 `bun run test`，`--maxWorkers=1`）：50 passed / 1 skipped（51 文件）、244 项中 230 passed / 14 skipped、384.40s、exit 0——此前 4 failed / 226 passed 全部转绿。
- `bun run test:impact -- <四文件>` 命中 cli-host 4 个直接测试，18 项全绿（最终文件内容，含声明头修订后的重跑）。
- 修改声明头：四文件此前为上游原文，本次首次修改，ratchet 判负 4 条；补 `// Modified by The Open Forge contributors.` 后 `check-modified-file-notices --baseline` 复跑 new=0、exit 0。
- 附带事实：`get_goal` 等工具 schema 中的 `description`（call reason）属性来自 coding-agent 的 `coding-agent.call-description` 投影器（`tool-projection-policy.ts` → `createModelOnlyToolInputPropertyProjector`），对未原生声明的工具在模型可见面注入并 mapInput 剥离；期望值按此投影后的模型可见形态钉死。
- Desktop 完整套件复验（TASK-0197 停止点要求，包内 `bun run test`）：923 文件中 919 passed / 4 skipped；4921 项中 4906 passed / 15 skipped；848.85s、exit 0。目标特性相关 desktop 用例（goal 族 16+3）含在内。

## 交付记录

- 实际修改：`apps/cli-host/test/todo-runtime-contract.test.ts`、`runtime-composition-contract.test.ts`、`plugin-runtime-contract.test.ts`、`plugin-tool-runtime-contract.test.ts`（期望值同步 + 补 `Modified by` 声明头 + biome 格式化 2 处超长行）；`project/tasks/TASK-0203-cli-host-goal-tool-contract-sync.md`（新建）。
- 实际运行：见验收分层工程验证；零遮蔽——未延长超时、未删除/跳过断言或用例、未引入模糊匹配。
- 未运行及原因：真实模型与 UI 实机验证不适用（无行为变化）。
- 剩余风险：目标工具的 schema 字面量与投影行为强耦合——上游或本仓调整 `ToolCallDescriptionSchema`/goal 工具描述时这些断言会再次漂移并失败，属合同测试的预期失效路径；届时按同法同步期望值，不得回退为模糊匹配。
