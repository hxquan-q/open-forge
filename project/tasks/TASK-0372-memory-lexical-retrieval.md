---
id: TASK-0372
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S2；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0370, TASK-0371]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 5341cff2f
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/retrieval
  - packages/runtime-node/src/memory/index.ts
  - packages/runtime-node/vitest.config.ts
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/lexical-retrieval.test.ts
write_paths:
  - packages/runtime-node/src/memory/retrieval
  - packages/runtime-node/src/memory/index.ts
  - packages/runtime-node/vitest.config.ts
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/lexical-retrieval.test.ts
  - project/tasks/TASK-0372-memory-lexical-retrieval.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/runtime-node/src/memory/retrieval
  - packages/runtime-node/src/memory/index.ts
  - packages/runtime-node/vitest.config.ts
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/lexical-retrieval.test.ts
depends_on: [TASK-0370, TASK-0371]
conflicts_with: [TASK-0371, TASK-0373, TASK-0379, TASK-0381, TASK-0382, TASK-0383]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 有作用域的词法与中文短词检索

## 目标

提供项目隔离、当前状态过滤和来源可追踪的本地检索，包括中文短词、路径和错误码。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S2）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0370](TASK-0370-memory-project-identity.md)、[TASK-0371](TASK-0371-memory-sqlite-revision-store.md)。
- 输出：真实SQLite检索/索引重建与中文标识符夹具对照，不宣称语义召回。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0370`、`TASK-0371`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0372`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 实现unicode61/trigram、ID/路径精确字段和参数化查询，查询前用宿主scope/view/status/有效时间限制行。
- 1/2字短词使用有界instr fallback，验证引号、百分号、下划线等字面量；FTS原始语法不直接透传。
- 返回有界snippet/source refs/revision及degraded状态；索引重建可重复且不能把历史非active版本混作当前。

### 不做

- 不做embedding，不靠全库召回后Prompt屏蔽越权结果。
- 不把无命中、超时和DB错误混成相同成功响应。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| A/B同名模块且内容相反 | 在B检索短词、路径和错误码 | 只返回授权有效事实并可溯源 |
| 1/2/3字中文及含SQL/FTS符号的输入 | 查询并重建索引后重查 | 短词可用，符号按字面量，返回稳定且无注入 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：在B检索短词、路径和错误码→只返回授权有效事实并可溯源；查询并重建索引后重查→短词可用，符号按字面量，返回稳定且无注入。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/runtime-node/test/memory/lexical-retrieval.test.ts`
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
- 预期产物：真实SQLite检索/索引重建与中文标识符夹具对照，不宣称语义召回。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：回退新索引及查询策略，事实表不删；错误明确降级。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 合同修正：写域补入 `src/memory/index.ts` 与 `vitest.config.ts`（检索出口接线为原合同遗漏，fragments 路径按仓库发布说明事实改为 v0.1.3.md）。
- 实际修改：新增 `src/memory/retrieval/`：`lexical-query.ts`（纯查询计划：FTS5 字面量转义、Unicode 码点计数、<3 字短词 instr 回退并标 degraded、limit 有界）与 `lexical-index.ts`（独立连接同库 WAL，自持 trigram FTS 表，refresh 幂等重建、search 先按 scope/有效时间过滤行再匹配，绝不全库召回后屏蔽）；memory/index.ts 增补检索出口。
- 实际运行（2026-10-22，win32-x64，真实 FTS5）：`bun run test`（runtime-node）88 文件 572 例全绿（新增 lexical 11 例：计划/转义纯函数 3 + 作用域隔离、短词回退、路径/引号/星号/OR 字面量、双时态过滤、遗忘后重建不复活、空结果不降级混同 8）；完整 `bun run check` 全绿。
- 未运行：embedding/语义召回（0381/0382）；真实用户数据；多进程并发压测（WAL+busy_timeout 合同已由 0371 覆盖）。
- 承载提交即集成绑定；人工功能验收不适用（内部检索层，用户入口在 0374 工具/0377 界面）。
- 剩余风险：refresh 全量重建为 O(n)，S2 规模可接受，大数据量时改增量同步（登记到 0382 混合检索时评估）；检索层与 worker 写入的事务窗口由 WAL 快照隔离。
