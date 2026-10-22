---
id: TASK-0368
type: task
status: in_progress
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S0b；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0368-memory-sqlite-native-probe
worktree: ../open-forge-wt/task-0368-memory-sqlite-native-probe
base_commit: 802233321
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - apps/desktop/vite.main.config.ts
  - apps/desktop/src/main/shims/node-sqlite.ts
  - apps/desktop/scripts
  - packages/runtime-node/package.json
write_paths:
  - scripts/verify-memory-native.mjs
  - scripts/verify-memory-native.node-test.mjs
  - project/tasks/TASK-0368-memory-sqlite-native-probe.md
  - project/verification/HANDOFF-TASK-0368-window-b.md
exclusive_paths:
  - scripts/verify-memory-native.mjs
  - scripts/verify-memory-native.node-test.mjs
  - project/verification/HANDOFF-TASK-0368-window-b.md
depends_on: []
conflicts_with: [TASK-0197]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# SQLite 驱动与多运行时隔离门禁

## 目标

确定better-sqlite3在实际Node/Bun/Electron目标中的加载、FTS5和worker方案，避免记忆功能建立在不可用的builtin或共享ABI产物上。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S0b）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：无；可先完成此基础调查/验证。
- 输出：固定驱动/SQLite版本、各目标ABI结果、实际probe用法、未跑平台及明确阻断项。
- 准入：范围与输入已明确，可在用户要求开始后转in_progress；ready不代表当前已开工。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：条件支持：本Task可在合同和依赖满足后用独立Worktree执行；未实际创建或派发。
- 执行方式：`parallel`。
- 可并行Task：`TASK-0367`；以依赖和实际写域检查为准。
- 前置依赖：无。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`task/TASK-0368-memory-sqlite-native-probe`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0368`，创建后检查；串行Task不伪造独立Worktree。
- 窗口派工：本Task由窗口B实施；交付报告写入 `project/verification/HANDOFF-TASK-0368-window-b.md`（已列入write_paths/exclusive_paths），含实际命令/结果、候选commit与未跑项；派工事实源为 PLAN-0021 窗口派工段。发布说明由Coordinator在集成提交统一更新，Worker不写碎片或汇编正文。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 编写独立probe和合同测试，在临时目录固定候选版本与nativeBinding；不重建共享node_modules，不改变现有node:sqlite垫片。
- 验证事务、WAL、trigram、1/2/3字中文、worker关闭、备份恢复和不兼容ABI的明确错误，保存目标矩阵。
- 本机只执行可用平台；其他目标需匹配环境证据再放行，输出生产staging接入清单及未通过项。

### 不做

- 不安装生产依赖、不下载embedding模型、不启动用户Desktop。
- 不以本机Node通过替代Electron/其他平台证据，也不静默退JSON存储。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 隔离候选驱动和临时数据库 | 用目标运行时启动worker完成写入/检索/重开 | FTS/事务/关闭合同成立且不改共享二进制 |
| 不匹配ABI或缺失FTS | 执行probe | 明确失败并阻止对应平台扩大启用，不误报支持 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：用目标运行时启动worker完成写入/检索/重开→FTS/事务/关闭合同成立且不改共享二进制；执行probe→明确失败并阻止对应平台扩大启用，不误报支持。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `node --test scripts/verify-memory-native.node-test.mjs`
  - `node scripts/verify-memory-native.mjs --help`
- 质量检查：实际实施按选定文件运行test:impact与check:quick，代码任务完成运行完整 `bun run check`；完整检查不替代行为测试。
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
- 预期产物：固定驱动/SQLite版本、各目标ABI结果、实际probe用法、未跑平台及明确阻断项。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：移除独立probe或关闭实验，不修改用户DB及主进程SQL垫片；失败先更新选型。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：仅创建本任务合同及计划/需求/索引关联，没有生产实现。
- 实际运行：无本Task行为测试；本轮台账校验由PLAN-0021统一记录。
- 未运行：全部上述未来实现/构建/模型/UI验证；用户当前只要求出Task。
- Worktree：未创建、未初始化、未清理；本轮仅在主工作区串行编辑管理记录。
- 剩余风险：依赖与目标平台尚未兑现；实施前须回读前置产物和实际源码，再收敛测试名/写域，不能把规划路径当事实。
