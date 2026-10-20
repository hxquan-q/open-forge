---
id: TASK-0332
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request; .ua/knowledge-graph.json; RESEARCH-0033
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0326, TASK-0327, TASK-0330, TASK-0331]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（开发入口与共享规则串行维护）
base_commit: 3df17bdd1
read_paths: [.ua, .agents, .claude, AGENTS.md, CLAUDE.md, docs/dev, project, scripts/quality, scripts/agents, packages/runtime-subagents, packages/agent-team, packages/plugins/presets/allstar-coding]
write_paths: [.agents/skills/open-forge-task-intake/SKILL.md, .agents/skills/open-forge-task-intake/references/session-coordination.md, .agents/skills/open-forge-task-intake/references/knowledge-context.md, .agents/skills/open-forge-task-intake/references/scenarios.md, docs/dev/agent-rules/repository.md, docs/dev/agent-rules/autonomy.md, CLAUDE.md, project/tasks/TASK-0332-native-session-development-workflow.md, project/tasks/README.md, project/research/RESEARCH-0033-graph-and-native-development-workflow.md, project/research/README.md, project/plans/PLAN-0019-autonomous-development.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [.agents/skills/open-forge-task-intake]
depends_on: []
conflicts_with: [TASK-0326, TASK-0327, TASK-0328, TASK-0330, TASK-0331]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 在现有 Claude/Codex 会话中组织开发协作

## 目标与输入输出

用户已澄清：照常在 Claude Code/Codex 提需求，由当前会话自动调查、记录、拆分/派工、审查、验证、修复、集成及复盘。先使用现有 .ua 图谱理解项目，不再把后台调度器、模型 API 重配或新增隔离环境当成此路径的前置要求。本 Task 属于 Open-Forge-only 开发规则维护。

输入为用户目标、当前宿主实际工具、图谱与源码、已有 Task/协作/交付合同；输出为统一 intake 自动到达的会话协作流程、图谱读取步骤和可核对的验收场景。复用既有 Task/Worktree/检查/LESSONS，不另建状态机或外部 Agent 服务。

## 范围与并发

- serial，main 串行维护；独立评审仅只读本 Task diff，不允许共享目录并行写入，不需代码 Worktree。当前 Agent 负责集成及索引。
- 先检查图谱版本和增量，读取八层/导览以及相关子图，再以当前源码确认所有者与实际能力。图谱不含近期工作时直接调查新增文件，不重建、清理或提交 .ua。
- 共享入口在 .agents，Claude 继续复用 .claude/skills 链接；能力探测使用当前宿主提供的原生子任务工具。该工作流明确请求当前目标内的原生派工/只读独立评审；外部 Claude↔Codex 会话互调、真实模型 API、后台常驻与发布不在本 Task 授权内。
- 常规开发在合同明确后继续，无需逐步询问；分析/计划仍不编码，权限/费用/不可逆结果等实际闸门保持。并行写入只在符合既有授权和独立 Worktree 条件时进行。
- 不修改产品 Runtime、脚本执行证明/策略等级、模型配置或现有 .claude hooks，不运行真实 UI、CI 或付费 API，不宣称完整生产 L4 已验收。

## Given / When / Then

- Given 图谱存在但落后，When 调查模块，Then 读取元数据、验证 commit 后列增量、沿子图回读源码；缺少图谱不是未知模块不存在的证据。
- Given 需求进入当前 Claude/Codex 会话，When intake 完成 Task 合同，Then 原生能力可用时在同一目标内自动派发适当子任务、回收实际产物并继续；不要求用户再设置 agents.json 或操纵子 Agent。
- Given 共享写域/串行小修改/原生派工不可用，When 选择执行方式，Then 当前 Agent 串行实施并如实报告独立评审能力，不伪造另一工具或另一个模型的结果。
- Given 审查或验证失败，When 修复，Then 续接原 Task、保留失败证据并重新审查实际候选；重复无进展或真实权限闸门时报告具体阻断。
- Given 工程集成完成，When 收尾，Then 回写真实证据/提交/未执行项，按交付合同处理人工接受，继续本次目标内可执行依赖，不扫荡无关历史积压。

## 验证与验收

- 文档/技能维护，无产品运行时变化，不新增镜像字符串测试。执行 workflow-skills、check-agent-guide、project-indexes、check-task-worktrees、release-notes 和 diff 检查。
- 运行既有 workflow-skills/check-agent-guide/project-indexes 相关测试；独立只读原生子 Agent 审核当前变更并检查入口可达、图谱使用、派工回收、权限与交付语义。该实测仅证明本次宿主可执行轨迹，不代表未来所有 Claude/Codex 模型都通过。
- 工程验证：文档合同/链接/索引与相关回归通过；技术评审：原生新上下文只读审查通过，非异家族评审；集成：`e2734e423` 已原子提交至本地 main，未 push。人工功能验收：待用户新任务使用后反馈；发布：未授权。
- 验收输入：普通开发请求、只读研究请求、图谱过期、共享路径、缺少原生工具、审查拒绝和任务中断。预期产物为已有 Project 记录、真实工具派发/结果和验证证据；失败表现为只交计划、重配模型成为先决条件、假独立评审或把静态检查写作模型评测。

## 交付记录

- 实际修改：统一 intake 增加图谱调查与会话协作的必读路由，新增 knowledge-context/session-coordination 两份共享引用；更新 Claude 入口、仓库地图、自主协议的职责边界及六个场景，复用已有 Task/Worktree/交付规则。产品代码、.ua、模型配置与 scripts/agents 均未修改。
- 机械验证：workflow-skills、check-agent-guide、Project 索引、325 Task 合同（0 warning）、release-notes、git diff --check 均通过。现有三份回归文件共 29 例通过，1.46 秒；13 路径 check:quick（含全仓 guards）exit 0，日志位于系统临时目录 open-forge-native-session-quick-20261020.log。纯文档/技能维护未运行全仓类型检查和产品测试，不把静态检查写成模型行为评测。
- 原生轨迹：按新入口实际派发新上下文只读评审 `/root/native_workflow_review`，使用原生等待工具后回收最终结果：未发现阻塞问题。评审检查 9 个跟踪文件变更及 4 个新文件、图谱元数据/八层/十三站与相关一跳关系并回读源码；角色只读、不参与实现。四个文档场景推演为普通开发、纯分析、无原生工具、审查拒绝，结果符合预期。该推演不是完整开发功能 E2E，此轨迹不等于异厂商评审或 Claude 端实跑。
- 本轮调查复盘：前期把后台控制器的未配置状态误当作现有 Claude/Codex 会话的必需准入；通过图谱分层、模块源码和用户澄清纠正。该原因记录于 RESEARCH-0033，不用一次认知纠正虚增 LESSONS Seen 或晋升硬规则。
- 提交/集成：`e2734e423`，13 路径原子提交到本地 main；提交钩子通过且未重写文件，本轮后续仅回填集成元数据。审查无阻塞发现，无需修改候选规则。七个原有 temp 文件未读取、未改动或提交，未 push。
- 现有未跟踪 temp 文件原位保留；WSL 副本不自动覆盖，产品构建与 CI/UI 延期保持。
