---
id: TASK-0379
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S4；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0377]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 7406851cf
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/jobs
  - packages/runtime-node/src/memory/index.ts
  - packages/coding-agent/src/public-api/memory.ts
  - packages/runtime-node/src/memory/migrations
  - packages/coding-agent/src/memory/capture
  - packages/runtime-node/test/memory/capture-queue.test.ts
  - packages/coding-agent/test/memory/capture-observer.test.ts
write_paths:
  - packages/runtime-node/src/memory/jobs
  - packages/runtime-node/src/memory/index.ts
  - packages/coding-agent/src/public-api/memory.ts
  - packages/runtime-node/src/memory/migrations
  - packages/coding-agent/src/memory/capture
  - packages/runtime-node/test/memory/capture-queue.test.ts
  - packages/coding-agent/test/memory/capture-observer.test.ts
  - project/tasks/TASK-0379-memory-durable-capture-queue.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/runtime-node/src/memory/jobs
  - packages/runtime-node/src/memory/index.ts
  - packages/coding-agent/src/public-api/memory.ts
  - packages/runtime-node/src/memory/migrations
  - packages/coding-agent/src/memory/capture
  - packages/runtime-node/test/memory/capture-queue.test.ts
  - packages/coding-agent/test/memory/capture-observer.test.ts
depends_on: [TASK-0377]
conflicts_with: [TASK-0371, TASK-0372, TASK-0373, TASK-0381]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 增量捕获、持久队列与崩溃对账

## 目标

确保已提交回合证据被可靠、幂等地捕获并能在退出/崩溃后恢复，尚不调用抽取模型。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S4）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0377](TASK-0377-memory-desktop-control-ui.md)。
- 输出：真实临时DB重启/lease/竞态及排除内容证据，模型调用为零。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0377`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0379`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- Observer按合法source/branch/retention范围入持久队列；两事务窗口通过高水位对账补获，禁止全量无界回扫。
- 实现source+extractor-version幂等、job lease/退避/attempt、关闭与取消、策略/erasure复检，跨进程不只靠mutex。
- 排除thinking/系统提示/密钥/原始二进制，保留user/最终可见文本/经许可tool outcome引用及证据等级。

### 不做

- 不做LLM抽取、不自动外发或重扫真实历史。
- 不让观察失败改变原Turn终态，不把fire-and-forget当可靠完成。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 对话已提交但入队前崩溃 | 重启执行对账并重复事件 | 合法来源恰一次进入处理，cursor不跨scope漏记 |
| job领取后暂停/遗忘/取消 | 旧worker提交结果 | 复检阻断旧提交，记录可恢复状态，无thinking被持久化 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：重启执行对账并重复事件→合法来源恰一次进入处理，cursor不跨scope漏记；旧worker提交结果→复检阻断旧提交，记录可恢复状态，无thinking被持久化。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/runtime-node/test/memory/capture-queue.test.ts packages/coding-agent/test/memory/capture-observer.test.ts`
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
- 预期产物：真实临时DB重启/lease/竞态及排除内容证据，模型调用为零。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：停止自动job领取，保留cursor/queue与erasure，不丢已提交事实。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 合同修正：写域补两处出口接线（必要），fragments 改 v0.1.3.md。
- 实际修改：①`runtime-node/src/memory/jobs/`（MemoryCaptureQueue：持久 jobs 表（source+extractor 唯一）、幂等入队、原子 lease/attempt/过期回收、崩溃重开恢复、高水位表对账、提交前 erasure epoch 复检放弃）；②`coding-agent/src/memory/capture/`（extract 纯函数：user/助手最终可见文本候选、排除 thinking/系统指令/二进制，tool outcome 仅显式允许时登记引用型候选，sourceId 稳定；shouldEnqueue 有界过滤）；③两处出口导出。
- 实际运行（2026-10-22，win32-x64，真实 SQLite）：capture-queue 6/6（幂等、lease/完成、崩溃重开+过期 lease 重领 attempt=2、纪元前进放弃、高水位幂等、失败不伪装）；capture-observer 4/4（排除 thinking/系统、outcome 引用默认关、有界过滤、sourceId 稳定）；完整 `bun run check` 全绿。
- 未运行：真实 Provider 抽取（0380）；真实用户会话事件流（无授权）；自动重启调度（策略侧接线属 0380/后续）。
- 承载提交即集成绑定；人工验收不适用（内部队列层）。
- 剩余风险：退避策略现为固定不重领（failed 不自动重试，人工/后续重置策略），预算与优先级登记到 0380。
