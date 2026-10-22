---
id: TASK-0374
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S2；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0372, TASK-0373]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 8a177fc00
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/coding-agent/src/memory/tools
  - packages/coding-agent/src/memory/memory-runtime-feature.ts
  - packages/coding-agent/test/memory/explicit-tools.test.ts
write_paths:
  - packages/coding-agent/src/memory/tools
  - packages/coding-agent/src/memory/memory-runtime-feature.ts
  - packages/coding-agent/test/memory/explicit-tools.test.ts
  - project/tasks/TASK-0374-memory-explicit-tools.md
  - .github/release-notes/v0.1.3.md
  - packages/coding-agent/vitest.config.ts
exclusive_paths:
  - packages/coding-agent/src/memory/tools
  - packages/coding-agent/src/memory/memory-runtime-feature.ts
  - packages/coding-agent/test/memory/explicit-tools.test.ts
depends_on: [TASK-0372, TASK-0373]
conflicts_with: []
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 显式记住、检索、更正与遗忘工具

## 目标

通过稳定产品工具提供可追踪的明确记忆操作，保持旧memory工具在legacy模式的合同。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S2）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0372](TASK-0372-memory-lexical-retrieval.md)、[TASK-0373](TASK-0373-memory-erasure-barrier.md)。
- 输出：Tool Schema/结果/错误/权限合同与使用真实内存/SQLite adapter的连续操作。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0372`、`TASK-0373`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0374`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 实现版本化remember/recall/get/correct/forget注册，范围由宿主绑定，输出ID/revision/scope/状态与有界来源。
- correct使用expectedRevision，读写错误/取消不吞掉；模型不能自述principal或任意projectId。
- 同一会话只装配选定的新工具或legacy工具；保留老add/replace/remove输入输出语义与关闭模式。

### 不做

- 不做自动抽取，不开放工具自身扩权或绕开既有Tool Policy。
- 不让生成内容成为可信system instruction。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 有授权scope的显式会话 | 记住→recall/get→更正→forget | 来源/版本/错误反馈正确，删除后无旧值 |
| 模型伪造projectId或过期revision | 调用工具 | 明确拒绝越权或冲突，不写入旁项目 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：记住→recall/get→更正→forget→来源/版本/错误反馈正确，删除后无旧值；调用工具→明确拒绝越权或冲突，不写入旁项目。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/coding-agent/test/memory/explicit-tools.test.ts packages/coding-agent/test/memory/memory-tool.test.ts`
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
- 预期产物：Tool Schema/结果/错误/权限合同与使用真实内存/SQLite adapter的连续操作。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：停用新Feature选legacy或off，旧工具合同和旧文件不变。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 合同修正：写域补入 vitest.config.ts（fixtures 别名接线）并按发布说明事实改 v0.1.3.md。
- 实际修改：新增 `src/memory/tools/`（版本化五工具 memory_remember/recall/get/correct/forget：scope 由宿主绑定上下文折算（模型只能在允许清单内选 user/project，自述身份被拒 SCOPE_NOT_ALLOWED），写入返回稳定 ID/revision/scope/状态，correct 强制 expectedRevision，forget 家族级+alsoProcessSources 只登记不伪装完成；注册工厂 scopeUse 覆盖除 im-claw 外全部场景，与 legacy memory 工具不共存）；`memory-runtime-feature.ts` 重载支持单注册与多注册装配。工具经 ExplicitMemoryServices 端口驱动 runtime-node 存储（0375 接线时由宿主注入真实实例）。
- 实际运行（2026-10-22，win32-x64，真实存储驱动）：coding-agent 定向 254 文件 1633 例全绿（新增 explicit-tools 6 例：ID/revision/scope/来源、短词回退标注 degraded、冲突不吞、遗忘拒复活、未授权 scope 拒绝、注册合同）；完整 `bun run check` 全绿。
- 未运行：真实 Provider/模型行为；自动抽取（0380）；宿主装配接线（0375）。
- 承载提交即集成绑定；人工功能验收不适用（工具面，用户入口在 0375 接线后的正常会话）。
- 剩余风险：工具与宿主策略（memoryPolicy off 时不装配）的判定在 peripheral-assembly 接线时落地；召回注入预算留 0382。
