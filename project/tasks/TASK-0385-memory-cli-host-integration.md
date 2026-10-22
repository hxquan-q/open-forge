---
id: TASK-0385
type: task
status: draft
priority: P1
owner: apps/cli-host
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S7；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0380, TASK-0382]
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
  - apps/cli-host/src/rpc/runtime-host/cli-session-assembly.ts
  - apps/cli-host/test/memory-policy.test.ts
  - packages/coding-agent/src/bootstrap/launch-arguments.ts
  - packages/coding-agent/src/host/sdk-session/node-session-host.ts
write_paths:
  - apps/cli-host/src/rpc/runtime-host/cli-session-assembly.ts
  - apps/cli-host/test/memory-policy.test.ts
  - packages/coding-agent/src/bootstrap/launch-arguments.ts
  - packages/coding-agent/src/host/sdk-session/node-session-host.ts
  - project/tasks/TASK-0385-memory-cli-host-integration.md
  - .github/release-notes/fragments/v0.1.3/task-0385-memory.md
exclusive_paths:
  - apps/cli-host/src/rpc/runtime-host/cli-session-assembly.ts
  - apps/cli-host/test/memory-policy.test.ts
  - packages/coding-agent/src/bootstrap/launch-arguments.ts
  - packages/coding-agent/src/host/sdk-session/node-session-host.ts
depends_on: [TASK-0380, TASK-0382]
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# CLI 显式策略与跨会话记忆接入

## 目标

让CLI通过相同合同使用明确选择的记忆空间，保持legacy命令与宿主关闭行为。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S7）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0380](TASK-0380-memory-automatic-extraction.md)、[TASK-0382](TASK-0382-memory-hybrid-retrieval-context.md)。
- 输出：CLI真实内部装配、profile隔离、legacy参数与退出/RPC合同。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0380`、`TASK-0382`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0385`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 新增版本化CLI/SDK新策略入口与身份解析注入，旧--memory-mode/--memory-file保留原意；不因相同cwd自动继承Desktop/IM身份。
- 明确共享profile选择、scope缺省和只读/关闭模式；主会话/子Agent的捕获及预算与Desktop一致。
- CLI退出/取消释放worker与job，stdout/RPC不被日志污染，错误/usage/stop与打印模式合同保持。

### 不做

- 不静默把所有CLI输入写入全局，不自动打开IM rollover。
- 不访问真实Provider或用户状态目录。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 临时指定profile的CLI | 记住→退出→同profile新会话recall | 正确跨会话，其他profile/项目隔离 |
| 旧flag及取消/无Provider场景 | 运行正常CLI/RPC装配 | 兼容含义/输出与资源释放不回归，自动功能如实降级 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：记住→退出→同profile新会话recall→正确跨会话，其他profile/项目隔离；运行正常CLI/RPC装配→兼容含义/输出与资源释放不回归，自动功能如实降级。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- apps/cli-host/test/memory-policy.test.ts`
  - `bun run verify:runtime-contract`
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
- 预期产物：CLI真实内部装配、profile隔离、legacy参数与退出/RPC合同。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：关闭新策略/参数，旧命令行为保持，DB不自动降级或导出回覆盖。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；实施前须回读前置产物和实际源码，再收敛测试名/写域，不能把规划路径当事实。
