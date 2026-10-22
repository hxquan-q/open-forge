---
id: TASK-0389
type: task
status: draft
priority: P2
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S8 可选；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0384, TASK-0388]
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
  - scripts/evals/memory/graph
  - packages/coding-agent/src/memory/experimental-graph
  - project/verification
write_paths:
  - scripts/evals/memory/graph
  - packages/coding-agent/src/memory/experimental-graph
  - project/verification
  - project/tasks/TASK-0389-memory-graph-ablation.md
  - .github/release-notes/fragments/v0.1.3/task-0389-memory.md
exclusive_paths:
  - scripts/evals/memory/graph
  - packages/coding-agent/src/memory/experimental-graph
  - project/verification
depends_on: [TASK-0384, TASK-0388]
conflicts_with: [TASK-0367, TASK-0388]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 可选多跳关系或概要检索消融实验

## 目标

只有基线证明多跳/全局概括是主要瓶颈时，验证轻量关系/PPR或概要层是否有净收益。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S8 可选）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0384](TASK-0384-memory-experience-evolution.md)、[TASK-0388](TASK-0388-memory-evaluation-harness.md)。
- 输出：条件满足的实验设计、授权/成本与实际结果或否决记录，不将任务存在视为启用承诺。
- 准入：必须先由TASK-0388结果证明瓶颈并补齐实际实验输入/费用；保持draft，不提前引图。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0384`、`TASK-0388`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0389`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 先用已授权评测指出具体失误类与对照，再选择一种机制，固定输入/预算/版本，保持同scope/擦除策略。
- 对比混合基线记录任务成功、证据、图索引/摘要构建、查询尾延迟及额外模型费用，可独立关闭。
- 无稳定收益就保留否决证据并结束实验，不默认新增图服务或扩大发布。

### 不做

- 不把图结构当理解保证，不预设厂商成绩可迁移。
- 不默认安装图数据库/调用收费模型，不绕开删除和授权边界。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 已测主要瓶颈及同预算混合基线 | 启用单一图/概要候选进行消融 | 仅在证据净收益且门槛满足时建议保留 |
| 缺边/误关联/来源撤销或无收益 | 重建/查询或关闭实验 | 不越权不复活，回基线行为完整 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：启用单一图/概要候选进行消融→仅在证据净收益且门槛满足时建议保留；重建/查询或关闭实验→不越权不复活，回基线行为完整。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `node scripts/evals/memory/graph/run.mjs --dry-run`
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
- 预期产物：条件满足的实验设计、授权/成本与实际结果或否决记录，不将任务存在视为启用承诺。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：关实验provider/索引回混合检索；不影响事实存储。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；必须先由TASK-0388结果证明瓶颈并补齐实际实验输入/费用；保持draft，不提前引图。
