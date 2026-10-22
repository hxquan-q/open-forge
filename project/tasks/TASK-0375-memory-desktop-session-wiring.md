---
id: TASK-0375
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S3；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0367, TASK-0370, TASK-0374]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未创建）
base_commit: 32d1fbbac
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - apps/desktop/src/main/conversations/resolve-session-config.ts
  - apps/desktop/src/main/conversations/resolve-session-config.test.ts
  - apps/desktop/src/main/agent-runtime/composition.ts
  - packages/runtime-desktop/src/backend-pool.ts
  - packages/coding-agent/src/composition/session-initialization
  - packages/coding-agent/src/composition/contracts/runtime-composition-options.ts
  - packages/coding-agent/src/memory/context
  - packages/coding-agent/test/composition/persistent-memory.test.ts
write_paths:
  - apps/desktop/src/main/conversations/resolve-session-config.ts
  - apps/desktop/src/main/conversations/resolve-session-config.test.ts
  - apps/desktop/src/main/agent-runtime/composition.ts
  - packages/runtime-desktop/src/backend-pool.ts
  - packages/coding-agent/src/composition/session-initialization
  - packages/coding-agent/src/composition/contracts/runtime-composition-options.ts
  - packages/coding-agent/src/memory/context
  - packages/coding-agent/test/composition/persistent-memory.test.ts
  - packages/coding-agent/src/public-api/memory.ts
  - packages/coding-agent/package.json
  - apps/desktop/package.json
  - apps/desktop/README.md
  - tsconfig.json
  - apps/desktop/tsconfig.json
  - docs/architecture/dependents.md
  - bun.lock
  - project/tasks/TASK-0375-memory-desktop-session-wiring.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/main/conversations/resolve-session-config.ts
  - apps/desktop/src/main/conversations/resolve-session-config.test.ts
  - apps/desktop/src/main/agent-runtime/composition.ts
  - packages/runtime-desktop/src/backend-pool.ts
  - packages/coding-agent/src/composition/session-initialization
  - packages/coding-agent/src/composition/contracts/runtime-composition-options.ts
  - packages/coding-agent/src/memory/context
  - packages/coding-agent/test/composition/persistent-memory.test.ts
depends_on: [TASK-0367, TASK-0370, TASK-0374]
conflicts_with: [TASK-0382]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 正常会话接线与有界上下文注入

## 目标

让新记忆经正常Desktop创建/恢复和ContextProvider生效，与IM legacy rollover正交，保持用户显式启用前off。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S3）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0367](TASK-0367-memory-entry-compatibility-baseline.md)、[TASK-0370](TASK-0370-memory-project-identity.md)、[TASK-0374](TASK-0374-memory-explicit-tools.md)。
- 输出：真实内部宿主+受控Provider的正常入口流程、撤销投影与生命周期证据。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：串行：本Task涉及共享合同、迁移或宿主接线；其他只读调查可并行，代码写入不在同目录并发。
- 执行方式：`serial`。
- 可并行Task：当前无直接并行代码承诺；修改execution前重新核对共享路径与依赖。
- 前置依赖：`TASK-0367`、`TASK-0370`、`TASK-0374`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`main`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0375`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 宿主解析memoryPolicy及受控身份/预算并透传，绑定profile store lease；创建/恢复失败时释放。
- ContextProvider注入少量带来源的证据并按Turn snapshot固定，工具自身更新可经结果可见；撤销epoch在下一请求前过滤旧记忆派生块/工具结果。
- 覆盖工作/对话子cwd、单Agent、团队子Agent、批量/知识处理的不同捕获/授权缺省；启用新记忆不改变普通Desktop compaction。

### 不做

- 不读取真实用户历史，不通过打开legacy memoryMode代替新Feature。
- 不改变Provider角色、stop/usage、取消和canonical transcript。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 用户明确启用本地explicit模式 | 正常新建→保存事实→关闭→恢复 | 实际工具和注入可见，scope正确且资源不泄漏 |
| 新记忆与legacy模式分别开关 | 自动/手动压缩及forget后再次模型调用 | 旧rollover合同保持，普通Desktop不被滚动，已撤销派生块不再发送 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：正常新建→保存事实→关闭→恢复→实际工具和注入可见，scope正确且资源不泄漏；自动/手动压缩及forget后再次模型调用→旧rollover合同保持，普通Desktop不被滚动，已撤销派生块不再发送。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- apps/desktop/src/main/conversations/resolve-session-config.test.ts packages/coding-agent/test/composition/persistent-memory.test.ts packages/coding-agent/test/runtime-core/memory-context-runtime.test.ts`
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
- 预期产物：真实内部宿主+受控Provider的正常入口流程、撤销投影与生命周期证据。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：memoryPolicy off，仅关新Feature；IM旧flag、文件和压缩路径保持。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 合同修正：写域补入记忆公共出口/清单/路径图/边界声明等接线文件（生产接线必需），fragments 改 v0.1.3.md。
- 实际修改：①`@vetta/coding-agent/memory` 公共出口（工具组+上下文 Feature）；②composition 选项新增 `createExplicitMemoryRuntime` 宿主工厂，peripheral-assembly 在 memoryPolicy 活跃时装配（关闭/未配置零变化，不改旧 memoryMode/compaction 路径）；③`memory/context/`：证据上下文（有界条数/字符预算、来源与时间标记、明示数据非指令框架、空记忆不注入）与 `createPersistentMemoryFeature`；④Desktop `resolve-session-config` 透传 `memoryPolicy`（缺省不携带）；⑤Desktop `composition.ts` 提供 `createDesktopExplicitMemoryRuntime`：身份注册表解析 → store lease（会话 owner，prepare 内获取/dispose 释放）+ 词法索引 + 遗忘屏障 → 工具组与证据注入；初始化失败在 prepare 抛错不静默降级。
- 实际运行（2026-10-22，win32-x64）：定向 persistent-memory 5/5（策略开关、预算、工具+Provider 组合、下一 Turn 最新、遗忘过滤）、resolve-session-config 15/15（含缺省零变化、透传、非法策略边界拒绝）；完整 `bun run check` 全绿。
- 未运行：真实 Desktop 实例/Electron 主进程（verify:ui 未授权）；团队子 Agent/批量场景授权细化（后续控制面 0376 消费同一接线）；automatic 预算真实调用。
- 承载提交即集成绑定；人工功能验收对象：后续控制面（0377）提供入口后的用户流程。
- 剩余风险：证据注入按 store 当前有效读取（pinned 优先/recordedAt 倒序）；预算调优留 0382；用户设置入口在 0376/0377。
