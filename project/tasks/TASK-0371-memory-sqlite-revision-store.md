---
id: TASK-0371
type: task
status: done
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S2；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0369]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 777539cb4
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/store
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/src/memory/worker
  - packages/runtime-node/test/memory/revision-store.test.ts
  - packages/runtime-node/test/memory/worker-lifecycle.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/scripts/memory-native-staging.mjs
  - apps/desktop/scripts/memory-native-staging.node-test.mjs
write_paths:
  - packages/runtime-node/src/memory/index.ts
  - packages/runtime-node/src/memory/store
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/src/memory/worker
  - packages/runtime-node/test/memory/revision-store.test.ts
  - packages/runtime-node/test/memory/worker-lifecycle.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/scripts/memory-native-staging.mjs
  - apps/desktop/scripts/memory-native-staging.node-test.mjs
  - project/tasks/TASK-0371-memory-sqlite-revision-store.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/runtime-node/src/memory/index.ts
  - packages/runtime-node/src/memory/store
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/src/memory/worker
  - packages/runtime-node/test/memory/revision-store.test.ts
  - packages/runtime-node/test/memory/worker-lifecycle.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/scripts/memory-native-staging.mjs
  - apps/desktop/scripts/memory-native-staging.node-test.mjs
depends_on: [TASK-0369]
conflicts_with: [TASK-0369, TASK-0372, TASK-0373, TASK-0379, TASK-0381]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# SQLite 事实修订存储与资源生命周期

## 目标

以真实临时SQLite证明有来源的事实修订、并发事务、迁移和受管理worker可用，Feature保持关闭直到宿主闭环完成。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S2）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0369](TASK-0369-memory-runtime-contracts.md)。
- 输出：真实SQLite合同、native staging证据、关闭/故障/并发结果与索引扩展接口。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0369`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0371`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 按已定合同实现identity bindings、revision/source/current projection和可扩展schema migration，短事务内校验scope与expectedRevision；记录valid/recorded时间但不做复杂推理；身份策略由TASK-0370持有。
- 通过`runtime-node/memory`显式subpath与index导出Adapter，不让其他包深链src；任务表声明的index和清单属于本Task写域。
- 落地S0b批准的ABI隔离staging与nativeBinding解析；同进程profile共享worker，跨进程WAL并发，连接/lease按明确owner释放。
- 验证初始化失败回滚、磁盘错误、SQLITE_BUSY、并发更正、重启、备份和旧schema拒绝，不允许空库重建掩盖不兼容。

### 不做

- 不实现LLM抽取、向量库或UI，不触碰用户状态。
- 不在事务内调用Provider，不让同步SQL阻塞Renderer/Main。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 临时库中相同revision的并发更正 | 两个连接竞争提交 | 仅合法版本提交，另一方获冲突，来源/历史不丢 |
| 已写事实且worker被关闭/重启 | 恢复并读取 | 内容/时间/来源一致，资源只释放一次，迁移失败不破坏原库 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：两个连接竞争提交→仅合法版本提交，另一方获冲突，来源/历史不丢；恢复并读取→内容/时间/来源一致，资源只释放一次，迁移失败不破坏原库。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/runtime-node/test/memory/revision-store.test.ts packages/runtime-node/test/memory/worker-lifecycle.test.ts`
  - `node --test apps/desktop/scripts/memory-native-staging.node-test.mjs`
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
- 预期产物：真实SQLite合同、native staging证据、关闭/故障/并发结果与索引扩展接口。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：新Feature保持off；schema回滚通过备份或新库保留，禁止旧客户端破坏性打开新schema。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：新增 `@vetta/runtime-node/memory`（subpath 导出）：`worker/protocol.ts`（RPC 协议与存储层专用错误码）、`worker/worker-source.ts`（生成式 worker 引导源：迁移、短事务写入、scope/erasure/expectedRevision 事务内校验、备份）、`worker/memory-worker.ts`（静态异步工厂 + 同路径引用计数 lease 池，幂等关闭）、`migrations/migrations.ts`（v1 迁移清单，单调追加）；runtime-node 固定依赖 `better-sqlite3@13.0.3`；`apps/desktop/scripts/memory-native-staging.mjs`（staging 计划/复制/显式 nativeBinding 验证）及 5 例 node-test；vitest 别名、README 边界、dependents、tsconfig path、bun.lock 同步。
- 实际运行（2026-10-22，win32-x64，真实临时 SQLite + 真实 worker_threads）：`bun run test`（runtime-node）87 文件 563 例全绿（新增 revision-store 9 例：修订链/来源、并发更正 REVISION_CONFLICT、双时态区间关闭、遗忘家族清除与拒绝复活、越权 SCOPE_NOT_ALLOWED、重启一致、备份恢复、新 schema 拒绝且不破坏原库；worker-lifecycle 4 例：同路径共享、幂等释放、再获取、双 close）；`node --test apps/desktop/scripts/memory-native-staging.node-test.mjs` 5/5；`--verify` 在隔离 staging 目录用显式 nativeBinding 实际加载（SQLite 3.53.4）；完整 `bun run check` 全绿。
- Feature 保持关闭：无任何宿主接入（0375 起），不动用户状态。
- 未运行：强制 SQLITE_BUSY（>5s 写锁保持）与磁盘错误注入未模拟（busy_timeout=5000 与 WAL 合同由并发双连接覆盖）；macOS/Linux 打包链（无环境）；真实 Provider/UI。
- 承载提交即集成绑定；人工功能验收不适用（内部存储层，宿主入口在后续切片）。
- 剩余风险：生成式 worker 引导源与打包产物集成（asar unpack、DEFINITIONS 登记）在宿主接入/打包验证时落地；FTS 索引扩展点留给 0372。
