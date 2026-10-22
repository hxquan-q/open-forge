---
id: TASK-0369
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S1；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0367, TASK-0368]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 537af264e7ab2fb7364dded0649734ada07f2b01
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-memory
  - packages/coding-agent/src/composition/contracts/runtime-session-options.ts
  - packages/coding-agent/src/composition/contracts/memory-runtime.ts
  - packages/coding-agent/package.json
  - packages/runtime-node/package.json
  - package.json
  - bun.lock
  - tsconfig.json
  - apps/desktop/tsconfig.json
  - docs/adr
  - project/decisions/README.md
write_paths:
  - packages/runtime-memory
  - packages/coding-agent/src/composition/contracts/runtime-session-options.ts
  - packages/coding-agent/src/composition/contracts/memory-runtime.ts
  - packages/coding-agent/package.json
  - packages/runtime-node/package.json
  - package.json
  - bun.lock
  - tsconfig.json
  - apps/desktop/tsconfig.json
  - docs/adr
  - project/decisions/README.md
  - project/tasks/TASK-0369-memory-runtime-contracts.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/runtime-memory
  - packages/coding-agent/src/composition/contracts/runtime-session-options.ts
  - packages/coding-agent/src/composition/contracts/memory-runtime.ts
  - packages/coding-agent/package.json
  - packages/runtime-node/package.json
  - package.json
  - bun.lock
  - tsconfig.json
  - apps/desktop/tsconfig.json
  - docs/adr
  - project/decisions/README.md
depends_on: [TASK-0367, TASK-0368]
conflicts_with: [TASK-0371, TASK-0373, TASK-0381, TASK-0386, TASK-0387]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 记忆协议包与新旧策略合同

## 目标

建立无I/O的runtime-memory窄合同，并为memoryPolicy与legacy memoryMode正交组合确定类型、Schema、错误和兼容边界。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S1）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0367](TASK-0367-memory-entry-compatibility-baseline.md)、[TASK-0368](TASK-0368-memory-sqlite-native-probe.md)。
- 输出：ADR、公开类型/Schema/fixture、包边界与干净导出验证；新包必须可由标准构建/测试入口发现。
- 准入：前置 TASK-0367 已 done（VERIFY-0020）、TASK-0368 已 integrated（537af264e，win32-x64 门禁证据与跨平台未验证项已登记）；2026-10-22 回读合同与源码后转 in_progress。serial 任务发布说明直接入 v0.1.3.md（fragments 路径与仓库发布说明事实不符，已从写域移除）。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0367`、`TASK-0368`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0369`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 完成必要ADR与小包scaffold/exports/path maps；合同覆盖scope、来源、revision、时态选择、事务写入/读取/遗忘、稳定错误和合同fixture。
- 定义off/explicit/automatic及预算/授权输入，新旧配置合法组合由产品层解析；旧memoryMode/memoryFile默认与语义保持。
- 合同测试覆盖非法输入、越权scope、unknown有效时间、expectedRevision和撤销epoch；不让Node/runtime-core反向依赖产品。

### 不做

- 不引图服务、不做SQLite实现和真实模型调用。
- 不往runtime-storage根出口或Kernel塞产品策略，不把schema定义当功能交付。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 旧版产品配置 | 使用新解析器往返 | 默认开关与legacy字段含义保持 |
| 模型/磁盘带未知scope或不合法版本的输入 | 首次进入领域边界 | 拒绝并返回稳定错误，合法fixture由Node和产品共同消费 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：使用新解析器往返→默认开关与legacy字段含义保持；首次进入领域边界→拒绝并返回稳定错误，合法fixture由Node和产品共同消费。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:pkg runtime-memory`
  - `bun run test:impact -- packages/coding-agent/test/memory/memory-policy.test.ts`
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
- 预期产物：ADR、公开类型/Schema/fixture、包边界与干净导出验证；新包必须可由标准构建/测试入口发现。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：未启用Feature下回退新增合同与包引用；不迁移任何旧会话。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：新增 `packages/runtime-memory`（@vetta/runtime-memory，零内部依赖的窄合同包：errors/scopes/policy/legacy 正交解析/records 双时态/sources/temporal 选择/erasure 屏障/commands 并发规则/ports/schema/fixtures 子出口，35 例合同测试）；coding-agent 会话合同新增可选 `memoryPolicy` 字段并在 `parseCodingAgentRuntimeSessionConfiguration` 首次进入边界时结构校验；workspace/tsconfig(desktop)/bun.lock 三处登记；[ADR-0149](../../docs/adr/0149-memory-policy-legacy-decoupling.md)（memoryPolicy 与 legacy 解耦）、[ADR-0150](../../docs/adr/0150-runtime-memory-contract-package.md)（窄合同包与 SQLite 事实源方向）落盘；coding-agent README Context Boundary 与 dependents.md 同步。
- 实际运行（2026-10-22，win32-x64）：`bun run test:pkg runtime-memory` 通过（4 文件 35 例）；`bun run test:impact` 定向（memory-policy + runtime-host-retry-policy + resolve-session-config + session-agent-mode）共 29 例全绿；完整 `bun run check`（lint/types/guards/mobile-lint）全绿。
- 不变量证据：旧配置（无 memoryPolicy）解析路径零变化（retry-policy/resolve-session-config 既有合同全绿）；GWT 两面均覆盖：新旧字段同传正交组合（IM 场景）、automatic 缺预算/未知 mode/off 携带预算等非法输入报稳定错误。
- 未运行：真实 Provider/模型、UI、打包链路（无该面变更）；跨平台原生矩阵（TASK-0368 范围）。
- 工程验证完成；本任务无用户可见入口（纯合同层），人工功能验收对象是后续宿主接入（0375+），此处不适用并按工程证据闭合；承载提交即集成绑定。
- 剩余风险：Schema 与类型的同步演化依赖后续评审；fixture 将随 0371/0374 实现侧测试扩展。
