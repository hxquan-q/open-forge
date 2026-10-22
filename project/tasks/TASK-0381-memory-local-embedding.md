---
id: TASK-0381
type: task
status: draft
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S5；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0379]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0381-memory-local-embedding
worktree: unassigned（仅规划，未创建）
base_commit: 2f9d42762e2638601c5907bb1edfd88b36e0e68c
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
write_paths:
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
  - project/tasks/TASK-0381-memory-local-embedding.md
  - .github/release-notes/fragments/v0.1.3/task-0381-memory.md
exclusive_paths:
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
depends_on: [TASK-0379]
conflicts_with: [TASK-0369, TASK-0371, TASK-0372, TASK-0373, TASK-0376, TASK-0379]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 本地 embedding 资源与版本化向量存储

## 目标

在明确模型选择与资源许可后提供可恢复的本地embedding适配，向量版本不污染事实层。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S5）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0379](TASK-0379-memory-durable-capture-queue.md)。
- 输出：资源manifest/checksum与许可记录、版本化适配测试；实际下载/跨平台推理仅在明确授权/环境下验证。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：条件支持：本Task可在合同和依赖满足后用独立Worktree执行；未实际创建或派发。
- 执行方式：`parallel`。
- 可并行Task：`TASK-0380`；以依赖和实际写域检查为准。
- 前置依赖：`TASK-0379`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`task/TASK-0381-memory-local-embedding`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0381`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 固定候选模型产物/权重与运行库版本、许可证、checksum、query/passage前缀及维度，验证现有分发路径，不隐式复用评测开发依赖。
- 下载/加载由用户选择触发，标ready/unavailable/degraded；remote embedding单独选择，不默认外发或在打开页面时下载。
- 向量BLOB按model/revision/dimension/normalization隔离，任务幂等、source/erasure复检；取消/卸载/升级资源释放与索引epoch完整。

### 不做

- 不新增原生向量扩展或图数据库，不把模型card当实际产物已可发布。
- 无本地资源时不伪装语义检索已就绪。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 固定模型适配器及临时事实 | 生成向量、重启、升级模型版本 | 维度/归一化一致，不同版本禁止混算，事实不改 |
| 未下载、下载失败、加载取消或来源遗忘 | 进入或重试embedding工作 | 状态明确、词法仍可用、被忘事实无向量写回 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：生成向量、重启、升级模型版本→维度/归一化一致，不同版本禁止混算，事实不改；进入或重试embedding工作→状态明确、词法仍可用、被忘事实无向量写回。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/runtime-node/test/memory/embedding-adapter.test.ts`
- 质量检查：实际实施按选定文件运行test:impact与check:quick，代码任务完成运行完整 `bun run check`；完整检查不替代行为测试。
- 仅使用仓库Node runner；不裸跑bun test或直接Vitest。Go命令在 `apps/im-gateway` 执行，根检查不替代Go。
- 不默认启动dev或verify:ui，不调用真实Provider；真实模型质量、跨平台/真实窗口证据无授权或无环境时单列未执行。
- 当前版本发布碎片在实施时按Desktop manifest核实；并行Worker不改汇编正文或公共索引。

## 验收分层

- 工程验证：待执行；必须绑定版本、实际命令、上述GWT结果和未运行项。
- 技术评审：未执行；允许的评审方式与实际发现届时记录，不伪造独立评审。
- 集成：pending；尚无实现commit/Worktree，不因建Task而标integrated。
- 人工功能验收：待验收；工程完成后提供正常入口验收包，用户沉默不算接受。
- 发布：未授权；Task存在和工程完成都不自动发布。

## 功能验收包

- 入口与前置：前置依赖工程验证通过并在隔离状态中装配本Task能力；本轮尚无可用新功能。
- 操作步骤：按GWT的连续路径执行，覆盖明确失败/取消或越权分支。
- 预期产物：资源manifest/checksum与许可记录、版本化适配测试；实际下载/跨平台推理仅在明确授权/环境下验证。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：停语义模型、回词法检索，向量索引可丢弃重建，事实版本和撤销记录保持。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；实施前须回读前置产物和实际源码，再收敛测试名/写域，不能把规划路径当事实。
