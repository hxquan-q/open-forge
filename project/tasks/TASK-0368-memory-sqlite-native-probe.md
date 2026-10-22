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
- 定向命令（2026-10-22 实测，窗口 B，Worktree `../open-forge-wt/task-0368-memory-sqlite-native-probe`）：
  - `node --test scripts/verify-memory-native.node-test.mjs` → 15/15 通过（参数/隔离门禁/计划/短词合同/报告渲染/PATH 解析/模板完整性/--help 子进程）。
  - `node scripts/verify-memory-native.mjs --help` → 退出 0（合同测试内子进程断言）。
  - `node scripts/verify-memory-native.mjs --keep --json <临时>/matrix.json --work-dir <临时>/work` → 退出 0：node 26.3.1（ABI 147）、bun 1.4.2（ABI 147）、electron 41.10.7（真实 browser 进程，内嵌 node 24.18.0，ABI 145）三运行时各 12 项检查全部 PASS；驱动 better-sqlite3@13.0.3（N-API，包内 prebuilds），SQLite 3.53.4，binding `prebuilds/win32-x64.node` sha256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`。
- 质量检查（同 Worktree 实测）：`bun run test:impact -- scripts/verify-memory-native.mjs scripts/verify-memory-native.node-test.mjs project/tasks/TASK-0368-memory-sqlite-native-probe.md` → 受影响面含 scripts/agents 套件，runner/integrate/release 三个文件出现时序性 flake（5s 超时类）；归因：主工作区干净基线跑同一命令同样红 1 例、单文件串行复跑全绿，属先存环境 flake，与本 Task 新增文件无因果（本 Task 文件不进其 fixture，fixture 自建 scripts 桩）。`bun run check:quick` 与完整 `bun run check` → lint/types/mobile-lint 全绿；check:guards 唯一红为声明头 ratchet `packages/theme-ui/src/activity/ActivityPanel.tsx`（new=1），主工作区基线同样红，修复在 origin/dev 7326aa159 而本批不合并 origin/dev；该文件不在本 Task 写域。
- 仅使用仓库Node runner；不裸跑bun test或直接Vitest。Go命令在 `apps/im-gateway` 执行，根检查不替代Go。
- 不默认启动dev或verify:ui，不调用真实Provider；真实模型质量、跨平台/真实窗口证据无授权或无环境时单列未执行。
- 发布说明：按派工备忘（PLAN-0021 窗口派工段 2026-10-22），fragments 路径已从合同移除，B 不写发布说明，由 Coordinator 在集成提交更新 `v0.1.3.md`。

## 验收分层

- 工程验证：win32-x64 完成——三真实运行时 × 12 检查（nativeBinding 显式加载、WAL/FK/busy、事务回滚与第二连接、FTS5 unicode61 CJK 整 token 行为、trigram ≥3 字与 1/2 字 0 命中边界、参数化 instr 短词回退与授权过滤、FTS 字面量转义（裸 runtime-node 报 no such column、裸 OR 扩展、引号字面量命中）、重开持久化、backup 恢复、worker_threads 写入与干净关闭、wrong-arch 二进制明确报错）。未运行：darwin/linux 平台（无环境，如实标未验证）、Electron asar 打包后加载（属后续 staging/打包验证，非本 Task 合同）。
- 技术评审：未执行；允许的评审方式与实际发现届时记录，不伪造独立评审。
- 集成：pending；候选提交在 `task/TASK-0368-memory-sqlite-native-probe`，待 Coordinator 审查集成。
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

- 实际修改（窗口 B，2026-10-22）：新增 `scripts/verify-memory-native.mjs`（隔离 probe 驱动：固定版本安装、nativeBinding/事务/WAL/FTS5/短词/转义/重开/backup/worker/ABI 错误 12 项检查、JSON+人类可读矩阵报告）与 `scripts/verify-memory-native.node-test.mjs`（15 例合同测试，无网络/原生依赖）；更新本 Task 交付记录。未改任何生产代码、生产依赖、node:sqlite 垫片或共享 node_modules；仓库清单/锁文件零变化。
- 关键结论（win32-x64 实测）：better-sqlite3@13.0.3 为 N-API（node-addon-api@8）单二进制多运行时——npm 包内直接捆绑 `prebuilds/<platform>-<arch>.node`（无 postinstall 下载）；Electron 41.10.7（ABI 145）与 Node 26（ABI 147）加载同一 win32-x64.node，无需 electron-rebuild/per-ABI 产物；SQLite 3.53.4，FTS5 默认编译开启；FTS5 短词与字面量合同实证：trigram <3 字 0 命中（回退参数化 instr）、unicode61 不做 CJK 分词、裸路径/操作符查询会被 FTS5 语法误解析（no such column），必须字符串字面量转义。
- 实际运行：见上方定向命令与质量检查记录；probe 全矩阵退出 0。
- 未运行：darwin/linux 平台矩阵（无环境）；Electron asar 打包产物内加载（后续打包验证）；真实模型/检索质量（后续 Task）。
- Worktree：`../open-forge-wt/task-0368-memory-sqlite-native-probe`（派工代次 1，base 802233321）；候选提交在本分支，未 push、未合 main。
- 生产 staging 接入清单（给后续依赖此结论的 Task/Coordinator）：① 依赖声明处固定 `better-sqlite3@13.0.3`；② `apps/desktop/scripts/packaged-native-dependencies.mjs` DEFINITIONS 增 `{ name: "better-sqlite3", platforms: "all", unpack: true }`（.node 须 asar unpack）；③ 无需 electron-rebuild，但打包后仍须跑 verify-packaging-contract 实测加载；④ 记忆 worker 用显式 nativeBinding 路径加载（probe 同款模式）；⑤ 检索层实现须内置字符串字面量转义与 instr 短词回退（本 probe 已固化行为合同）。
- 剩余风险：多平台结论未兑现（需 macOS/Linux 环境重跑同一 probe）；bun worker/Electron worker 为本机单次证据，偶发时序问题未被并发压测覆盖；probe 工具本身留在仓库根 scripts/ 供后续复验，不进生产依赖图。
