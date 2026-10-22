---
id: TASK-0381
type: task
status: in_progress
priority: P1
owner: packages/runtime-node
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S5；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0379]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0381-memory-local-embedding
worktree: ../open-forge-wt/task-0381-memory-local-embedding
base_commit: e66f1f259a29550b9e2566e0c890fc5aff4aafe4
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
write_paths:
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
  - apps/desktop/src/main/memory/embedding-models.node-test.mjs
  - project/tasks/TASK-0381-memory-local-embedding.md
  - project/verification/HANDOFF-TASK-0381-window-b.md
exclusive_paths:
  - project/verification/HANDOFF-TASK-0381-window-b.md
  - packages/runtime-node/src/memory/embedding
  - packages/runtime-node/src/memory/migrations
  - packages/runtime-node/test/memory/embedding-adapter.test.ts
  - packages/runtime-node/package.json
  - bun.lock
  - apps/desktop/src/main/memory/embedding-models.ts
depends_on: [TASK-0379]
conflicts_with: [TASK-0369, TASK-0371, TASK-0372, TASK-0373, TASK-0376, TASK-0379, TASK-0197]
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 本地 embedding 资源与版本化向量存储

## 目标

在明确模型选择与资源许可后提供可恢复的本地embedding适配，向量版本不污染事实层。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S5）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0379](TASK-0379-memory-durable-capture-queue.md)。
- 输出：资源manifest/checksum与许可记录、版本化适配测试；实际下载/跨平台推理仅在明确授权/环境下验证。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：条件支持：本Task可在合同和依赖满足后用独立Worktree执行；未实际创建或派发。
- 执行方式：`parallel`。
- 可并行Task：`TASK-0380`；以依赖和实际写域检查为准。
- 前置依赖：`TASK-0379`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`task/TASK-0381-memory-local-embedding`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0381`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 固定候选模型产物/权重与运行库版本、许可证、checksum、query/passage前缀及维度，验证现有分发路径，不隐式复用评测开发依赖。
- 下载/加载由用户选择触发，标ready/unavailable/degraded；remote embedding单独选择，不默认外发或在打开页面时下载。
- 向量BLOB按model/revision/dimension/normalization隔离，任务幂等、source/erasure复检；取消/卸载/升级资源释放与索引epoch完整。

### 不做

- 不新增原生向量扩展或图数据库，不把模型card当实际产物已可发布。
- 无本地资源时不伪装语义检索已就绪。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 固定模型适配器及临时事实 | 生成向量、重启、升级模型版本 | 维度/归一化一致，不同版本禁止混算，事实不改 |
| 未下载、下载失败、加载取消或来源遗忘 | 进入或重试embedding工作 | 状态明确、词法仍可用、被忘事实无向量写回 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：生成向量、重启、升级模型版本→维度/归一化一致，不同版本禁止混算，事实不改；进入或重试embedding工作→状态明确、词法仍可用、被忘事实无向量写回。
- 定向命令（2026-10-23 实测，窗口 B，Worktree ../open-forge-wt/task-0381-memory-local-embedding）：
  - packages/runtime-node 内 bun run test test/memory/embedding-adapter.test.ts → 14/14 通过（真实临时 SQLite + 真实事实 worker/擦除层：确定性适配器跨实例稳定与 l2 归一化、空输入/dispose 明确错误、写入→重启→检索 cosine≈1 且 memory_revisions 行数不变、双空间隔离与 dropSpace 只清派生层、维度/归一化/关闭后写入拒绝、scope 过滤、资源四态 directory-missing/artifact-missing/checksum-not-pinned/checksum-mismatch→degraded/ready、未下载与加载失败与取消的错误码 + 同库词法检索不受影响、ONNX 前缀注入与维度校验、幂等入队与重启完成态、入队后遗忘 abandoned 且写入点拒 suppressed、模型不可用任务 failed 原因可读、过期 lease 回收重领）。
  - node --test apps/desktop/src/main/memory/embedding-models.node-test.mjs → 3/3 通过（候选目录不变量：维度384/前缀/许可证/checksum 如实 null；状态解析六分支纯函数；描述输出无路径/密钥）。
  - bunx tsgo --noEmit（根）→ 无错误。
- 质量检查（同 Worktree 实测）：完整 `bun run check` → types（root/desktop/docs/mobile）、lint、mobile-lint 全绿；check:guards 唯一红为 project-indexes `unknown TASK-0365`（并行会话已提交索引行但文件未入库，干净检出必红、主工作区因未提交文件在盘而绿——先存血统问题，不在本 Task 写域）。runtime-node 全包测试 89/92 文件通过，3 文件红（import-export/glob/grep）经主工作区基线复跑同样红，属先存问题。test:impact 并行重套件 20 分钟无产出已终止，以上述等价覆盖替代。
- 仅使用仓库Node runner；不裸跑bun test或直接Vitest（node-test 文件按合同命令 node --test 直跑）。Go命令在 apps/im-gateway 执行，根检查不替代Go。
- 不默认启动dev或verify:ui，不调用真实Provider；真实模型下载/跨平台推理质量无授权未运行，如实单列。
- 发布说明：按派工备忘（同 TASK-0368），B 不写发布说明，由 Coordinator 在集成提交更新 v0.1.3.md。

## 验收分层

- 工程验证：合同级完成——适配器端口（确定性 + ONNX 双实现、注入运行库端口）、版本化向量存储（空间键全字段隔离、写入点校验、遗忘/时间/scope 过滤检索、dropSpace 重建）、持久 embedding 任务队列（幂等/lease/过期回收/完成前 erasure+suppressed 复检）、桌面候选模型目录与 ready/unavailable/degraded 纯函数状态解析。真实模型下载、ONNX 实际推理、跨平台行为未运行（无授权/无环境，如实未验证；checksum 与运行库版本待授权下载时钉住）。
- 技术评审：未执行；允许的评审方式与实际发现届时记录，不伪造独立评审。
- 集成：pending；候选提交在 task/TASK-0381-memory-local-embedding，待 Coordinator 审查集成。
- 人工功能验收：待验收（工程完成后由后续 Desktop 控制面任务提供入口；本 Task 交付底层资源与存储合同）。
- 发布：未授权；Task存在和工程完成都不自动发布。

## 功能验收包

- 入口与前置：前置依赖工程验证通过并在隔离状态中装配本Task能力；本轮尚无可用新功能。
- 操作步骤：按GWT的连续路径执行，覆盖明确失败/取消或越权分支。
- 预期产物：资源manifest/checksum与许可记录、版本化适配测试；实际下载/跨平台推理仅在明确授权/环境下验证。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：停语义模型、回词法检索，向量索引可丢弃重建，事实版本和撤销记录保持。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改（窗口 B，2026-10-23）：新增 packages/runtime-node/src/memory/embedding/（embedding-adapter.ts、vector-store.ts、embedding-jobs.ts、index.ts）、packages/runtime-node/test/memory/embedding-adapter.test.ts、apps/desktop/src/main/memory/embedding-models.ts 与 embedding-models.node-test.mjs；更新本 Task 合同。package.json、bun.lock、migrations/migrations.ts 与生产既有文件零变化——向量表为派生索引表（沿用 0372 词法索引先例，不进 MEMORY_SCHEMA_VERSION 事实迁移）；ONNX 运行库按清单懒加载注入，不新增安装依赖。
- 关键设计：向量空间键（model/revision/dimension/normalization）进主键与全部查询，跨版本混算结构性不可能；被忘事实三重防线（入队 epoch 复检、完成前 epoch+suppressed 复检、写入点 suppressed 拒绝）；模型不可用/损坏/取消均有稳定错误码，词法路径不受影响；候选模型 checksum 如实 null——未钉住的候选不可判 ready，「模型卡可用」不伪装成「已有可发布本地产物」。
- 实际运行：见上方定向命令；14/14 与 3/3 通过，根 tsgo 无错误。
- 未运行：真实模型下载与 ONNX 推理（需用户授权，届时钉 sha256/bytes/运行库版本并独立验收）、跨平台行为、Desktop UI 入口（后续任务）。
- Worktree：../open-forge-wt/task-0381-memory-local-embedding（派工代次 1，base e66f1f259）；候选提交在本分支，未 push、未合 main。
- 需要 Coordinator 处理：① packages/runtime-node/src/memory/index.ts 增一行 embedding 再导出（该文件不在本 Task 写域，未擅自修改；0382 消费前接入）；② 遗忘流程对向量表的联动清理可在 0382/0373 复核（本 Task 已提供 purgeMemory/purgeScope/dropSpace 与检索期过滤）；③ e5 ONNX 产物 checksum/运行库版本钉住需用户授权下载后回填 EMBEDDING_MODEL_CATALOG。
- 剩余风险：确定性适配器非语义（测试边界已注明）；真实 e5-small 量化产物的质量/体积/加载时间未测；多进程并发写同一向量表的压测未做（WAL+busy_timeout 同词法层约定）。
