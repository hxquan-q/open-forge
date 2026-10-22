---
id: TASK-0373
type: task
status: draft
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S2；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0372]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 2f9d42762e2638601c5907bb1edfd88b36e0e68c
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/erasure
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/erasure.test.ts
  - packages/runtime-memory/test/erasure-contract.test.ts
write_paths:
  - packages/runtime-node/src/memory/erasure
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/erasure.test.ts
  - packages/runtime-memory/test/erasure-contract.test.ts
  - project/tasks/TASK-0373-memory-erasure-barrier.md
  - .github/release-notes/fragments/v0.1.3/task-0373-memory.md
exclusive_paths:
  - packages/runtime-node/src/memory/erasure
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/erasure.test.ts
  - packages/runtime-memory/test/erasure-contract.test.ts
depends_on: [TASK-0372]
conflicts_with: [TASK-0369, TASK-0371, TASK-0372, TASK-0379, TASK-0381]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 全版本遗忘与防重抽取撤销屏障

## 目标

让“忘记”清除整个记忆家族及派生可见性，防旧版本、旧索引与未来队列任务恢复。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S2）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0372](TASK-0372-memory-lexical-retrieval.md)。
- 输出：擦除、并发epoch、重建/恢复防重生与原始来源边界合同。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0372`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0373`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 实现事务性erasure epoch、source suppression和版本家族清除，隐私审计只留必要无正文标识，不自动恢复parent。
- 定义所有派生索引/缓存/待处理job提交前检查撤销的通用合同；当前FTS实测，向量/摘要由后续消费者接同一contract。
- 区分遗忘、撤销一次更正、过时失效及处理原始来源，说明WAL/备份/用户另存副本的实际边界。

### 不做

- 不静默删除原始会话或用户文件，不宣称抗磁盘取证擦除。
- 不只删latest或只删向量。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 一条事实有多个revision和FTS引用 | 忘记后检索/重启/重建 | 整个家族不可召回，旧来源被抑制且parent不复活 |
| 旧任务持有遗忘前epoch | 在遗忘提交后尝试写入派生结果 | 提交被拒绝，其他scope内容不受影响 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：忘记后检索/重启/重建→整个家族不可召回，旧来源被抑制且parent不复活；在遗忘提交后尝试写入派生结果→提交被拒绝，其他scope内容不受影响。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/runtime-node/test/memory/erasure.test.ts packages/runtime-memory/test/erasure-contract.test.ts`
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
- 预期产物：擦除、并发epoch、重建/恢复防重生与原始来源边界合同。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：停止新写入但保留撤销标记；不得因回滚恢复被删内容。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；实施前须回读前置产物和实际源码，再收敛测试名/写域，不能把规划路径当事实。
