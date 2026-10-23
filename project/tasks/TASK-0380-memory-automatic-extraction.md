---
id: TASK-0380
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement: REQ-0027
plan: PLAN-0021
source: 用户要求出 Task（2026-10-22）；PLAN-0021 S4；RESEARCH-0038/0039
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0379]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0380-memory-automatic-extraction
worktree: unassigned（仅规划，未创建）
base_commit: 201fb087e
read_paths:
  - AGENTS.md
  - project/plans/PLAN-0021-agent-persistent-memory.md
  - project/requirements/REQ-0027-agent-persistent-memory.md
  - project/research/RESEARCH-0038-agent-persistent-memory.md
  - project/research/RESEARCH-0039-pi-memory-implementation-benchmarks.md
  - packages/coding-agent/src/memory/extraction
  - packages/coding-agent/src/memory/ai-memory-fact-extractor.ts
  - packages/coding-agent/test/memory/automatic-extraction.test.ts
write_paths:
  - packages/coding-agent/src/memory/extraction
  - packages/coding-agent/src/memory/ai-memory-fact-extractor.ts
  - packages/coding-agent/test/memory/automatic-extraction.test.ts
  - project/tasks/TASK-0380-memory-automatic-extraction.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - packages/coding-agent/src/memory/extraction
  - packages/coding-agent/src/memory/ai-memory-fact-extractor.ts
  - packages/coding-agent/test/memory/automatic-extraction.test.ts
depends_on: [TASK-0379]
conflicts_with: []
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 受预算约束的自动抽取与事实合并

## 目标

从持久捕获的合法证据生成可追踪候选和更新判断，执行用户选择的模型与预算。

来源：[REQ-0027](../requirements/REQ-0027-agent-persistent-memory.md)、[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)（S4）。改动归类为 Open-Forge-only。本轮仅建任务；以下实施、测试和产物均待执行，新增目录、测试名与命令为拟定目标，不表示文件已存在或测试已通过。

## 输入、输出与准入

- 输入：上面关联的需求/方案、当前源码与测试、前置任务的接口/验证/回滚产物。
- 依赖：[TASK-0379](TASK-0379-memory-durable-capture-queue.md)。
- 输出：确定性模型边界fixture的软件合同；真实效果/费用单列待授权评测。
- 准入：前置产物尚未交付，保持draft；依赖验证通过并回读实际文件清单/接口后再转ready。
- 规划基线：`2f9d42762e2638601c5907bb1edfd88b36e0e68c`；真正开工或创建Worktree时重新核对HEAD与依赖，不把此Hash当作已包含上游Task结果。
- 原生依赖、模型下载、真实Provider/费用、UI实例、迁移用户数据与发布分别遵守授权边界；本次“出Task”不执行这些动作。

## 范围

### 并发评估

- 结论：条件支持：本Task可在合同和依赖满足后用独立Worktree执行；未实际创建或派发。
- 执行方式：`parallel`。
- 可并行Task：`TASK-0381`；以依赖和实际写域检查为准。
- 前置依赖：`TASK-0379`。
- 冲突/独占：frontmatter的write_paths、exclusive_paths及conflicts_with为准；登记冲突意味着不得同时写，不是自动解决冲突。
- Branch：`task/TASK-0380-memory-automatic-extraction`；Worktree：未创建。并行候选实际执行前走 `bun run worktree:check --all` 和 `bun run worktree:create --task TASK-0380`，创建后检查；串行Task不伪造独立Worktree。
- 集成负责人：当前会话Coordinator。依赖产物先集成，再执行本Task；仅本Task技术路径归Worker，Task状态/公共索引/发布说明汇编由Coordinator核实维护。

### 做

- 结构化候选包含source refs/角色/有效时间/置信状态；ADD/REVISE/RETRACT/NOOP提交前校验实体/scope/当前revision。
- 有明确抽取Provider配置、单job输出/日预算、错误分类与无新事实区分；调用在事务外，attempt/策略变更重检。
- 可靠tool outcome只证明其实际范围；助手推测/相似词/否定/计划与事实区分，污染内容不变为高权限指令。

### 不做

- 不实际调用未授权Provider，不增加无限反思或自动全局晋升。
- 不靠弱化角色、工具、错误、usage/stop语义换测试通过。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 包含更正、计划、失败tool结果与助手成功宣称的fixture | 受控Provider输出候选并提交 | 只持久化证据支持的状态，来源和修订可查 |
| 预算耗尽、invalid-output、Provider失败或处理期间遗忘 | 处理job | 明确暂停/失败/拒绝提交，不混为NOOP，不改变主Turn终态 |

## 必须保持

- 用户和其他Agent现有修改、包依赖方向和旧兼容合同；实现前读取目标最近AGENTS/README/ADR。
- 记忆是带来源的数据，不扩大Tool权限或覆盖当前指令；不持久化thinking、系统Prompt、凭据或无关私有资料。
- 正常Session/Turn的角色、工具结果、错误、取消、usage/stop及generation语义；旁路失败不能篡改主回合终态。
- 源码/类型/实际脚本是事实源；不得通过删断言、放宽检查或回退依赖证明完成。
- 本Task未列的生产路径不得顺带改动；实际需要扩大接口/迁移范围时先回写合同与冲突关系。

## 测试与验证

- 层级：按下列公开合同/真实内部装配证明GWT；受控Provider/模型替身仅用于外部边界，不将内部协作者全部Mock后只测调用。
- 代表流程：受控Provider输出候选并提交→只持久化证据支持的状态，来源和修订可查；处理job→明确暂停/失败/拒绝提交，不混为NOOP，不改变主Turn终态。
- 拟定定向命令（新测试文件在实施时创建并核实；均未运行）：
  - `bun run test:impact -- packages/coding-agent/test/memory/automatic-extraction.test.ts`
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
- 预期产物：确定性模型边界fixture的软件合同；真实效果/费用单列待授权评测。
- 不通过表现：GWT任一不成立、超出scope/预算、错误被吞或兼容语义变化；未运行的模型/UI/平台能力不得填通过。
- 回滚：automatic降explicit，持久队列保留可观察状态，已忘内容不恢复。
- 验收反馈/回归案例：尚无；反馈须关联此Task并补可失败的回归证据。

## 交付记录

- 实际修改：新增 `src/memory/extraction/`（AutomaticExtractionRunner：日预算账本（领即计）、单 job 输出上限、ExtractorPort 事务外调用、错误三分类（provider-transient/invalid-output/budget-exhausted）；validateSuggestion（越权 scope/空内容/revision 不匹配降 NOOP，自动抽取不授予高证据等级）；mergeSuggestions（同键去重，NOOP 丢弃））。
- 实际运行（2026-10-22，win32-x64，确定性替身）：定向 7/7（校验降级、revision 匹配、证据降级、去重、预算耗尽/分类、完整流程、输出上限）；完整 `bun run check` 全绿。
- 未运行：真实抽取 Provider（未授权，模型质量保持未验证，不扩大 automatic 默认启用）；与捕获队列的调度集成（后续消费方接线）；真实会话事件流。
- 承载提交即集成绑定；人工验收不适用（内部决策层）。
- 剩余风险：输出上限用保守 token 换算（每条 40）；调度与退避接入队列层时统一验证。
