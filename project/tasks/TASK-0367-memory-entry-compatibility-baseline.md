---
id: TASK-0367
type: task
status: ready
priority: P1
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S0a；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: []
related_issues: []
related_bugs: []
execution: coordination-only
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 2f9d42762e2638601c5907bb1edfd88b36e0e68c
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - apps/desktop/src/main/conversations/resolve-session-config.ts
  - packages/coding-agent/src/memory
  - packages/runtime-desktop/src/backend-pool.ts
  - apps/im-gateway
write_paths:
  - project/verification
  - project/tasks/TASK-0367-memory-entry-compatibility-baseline.md
exclusive_paths:
  - project/verification
depends_on: []
conflicts_with: [TASK-0388, TASK-0389]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 记忆入口与 legacy rollover 兼容基线

## 目标

从真实产品装配确认 Desktop/CLI/IM 的启用、冻结快照、flush 和 rollover 行为，为新策略与旧模式解耦提供可重复基线。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S0a）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：无；可先完成此基础调查/验证。
- 输出：源码锚点、版本、实际基线命令/结果及未跑路径，进入后续任务的兼容矩阵。
- 准入：范围与输入已明确，可在用户要求开始后转in_progress；ready不代表当前已开工。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：条件支持：本Task只做证据调查，可与独立驱动probe并行；实际文件落盘与索引由Coordinator串行维护。
- 执行方式：`coordination-only`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：无。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0367`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 追踪新建、恢复、对话子cwd、项目、单Agent/团队/批量入口，分别记录配置→工具→模型上下文；区分Profile声明与实际启用。
- 在隔离fixture上运行既有合同，记录memoryMode关闭/开启、手动/自动压缩、IM /new flush及日期cwd的保留行为。
- 按目录模板登记VERIFY和明确的策略/兼容矩阵；如需新增复现测试，应先另细化本Task写域，不顺带修实现。

### 不做

- 不启用新Feature、不改Provider/压缩逻辑、不读取真实历史。
- 不把基线调查或工厂存在当功能完成。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 正常Desktop/CLI和IM配置fixture | 分别创建、恢复和压缩会话 | 给出工具/注入/continuation的实际基线与来源，不混淆三种宿主 |
| 相同对话与受控Provider | 关闭和开启legacy memoryMode | 证明哪些阈值、flush和rollover行为必须保持 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：分别创建、恢复和压缩会话→给出工具/注入/continuation的实际基线与来源，不混淆三种宿主；关闭和开启legacy memoryMode→证明哪些阈值、flush和rollover行为必须保持。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/coding-agent/test/composition/memory-runtime.test.ts packages/coding-agent/test/runtime-core/memory-context-runtime.test.ts apps/desktop/src/main/conversations/resolve-session-config.test.ts`
- 质量检查：纯基线/记录任务核对链接与证据；如新增测试代码，按实际变更补定向test:impact及完整bun run check。
- 仅使用仓库Node runner；不裸跑bun test或直接Vitest。Go命令在 `apps/im-gateway` 执行，根检查不替代Go。
- 不默认启动dev或verify:ui，不调用真实Provider；真实模型质量、跨平台/真实窗口证据无授权或无环境时单列未执行。
- 当前版本发布碎片在实施时按Desktop manifest核实；并行Worker不改汇编正文或公共索引。

## 验收分层

- 工程验证：待执行；必须绑定版本、实际命令、上述GWT结果和未运行项。
- 技术评审：未执行；允许的评审方式与实际发现届时记录，不伪造独立评审。
- 集成：pending；尚无实现commit/Worktree，不因建Task而标integrated。
- 人工功能验收：不适用（内部基线/验证工具按证据合同验收，不能代替后续功能接受）。
- 发布：未授权；Task存在和工程完成都不自动发布。

## 功能验收包

- 入口与前置：独立隔离基线/probe环境；本轮尚无可用新功能。
- 操作步骤：按GWT的连续路径执行，覆盖明确失败/取消或越权分支。
- 预期产物：源码锚点、版本、实际基线命令/结果及未跑路径，进入后续任务的兼容矩阵。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：仅管理证据，无运行时变更；发现源码与计划冲突时更新PLAN而非改基线断言。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；实施前须回读前置产物和实际源码，再收敛测试名/写域，不能把规划路径当事实。
