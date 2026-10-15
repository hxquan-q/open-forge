---
id: TASK-0164
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0136]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行文档维护）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [AGENTS.md, docs/dev/agent-rules, docs/dev/quality-gates.md, project, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing, scripts/quality, .github/release-notes]
write_paths: [.agents/skills/open-forge-task-intake/SKILL.md, .agents/skills/open-forge-task-intake/references/scenarios.md, .agents/skills/open-forge-testing/SKILL.md, project/README.md, project/CONVENTIONS.md, project/tasks/README.md, project/tasks/TASK-0164-intake-record-before-implementation.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [.agents/skills/open-forge-task-intake/SKILL.md, project/CONVENTIONS.md]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 开发入口先记录再实施

## 目标与依据

归属：Open-Forge-only。用户反馈 intake 使用后直接编码，要求结合现有工程框架完善入口。原始技能允许简单任务使用未指定保存位置的短合同，实施条件未包含 Task 记录；testing 支持直接请求但未明确先经过任务记录步骤。

## 范围与方案

- 做：在 Project 规范明确实施前记录政策；intake 编排已有条目检索、最小记录选择、合同落盘、实施前检查和交付回写；testing 引用统一入口；补路由验收场景。
- 不做：新增任务系统、修改产品源码、自动调用真实模型、启动 Desktop、修改全局技能、重解释历史状态、推送或发布。
- 选择直接完善现有权威文档和引用，无需新框架或 ADR；保留分析/计划与实施边界、测试方法、授权及交付状态合同。
- 并发结论：不支持本次任务内并发写入。政策、入口和 testing 引用有顺序依赖，在 main 串行完成，不创建 Worktree。共享索引与发布说明使用局部编辑，保留已有修改；其他 Task 不被本次派工或修改。
- 输入：REQ-0004、PLAN-0004、用户反馈及现行规范；输出：一致的实施前记录合同、场景清单与真实验证记录。

## Given / When / Then 与验收

- Given 无已有 Task 的小修改，When 用户要求实施，Then 首次实现或测试文件修改前创建合规 Task、明确合同和并发结论并进入 in_progress，无需创建整套 REQ/PLAN。
- Given 已有相关 Task，When 继续实施或验收反馈修正，Then 先读取并更新该 Task；独立新增 concern 另拆 Task。
- Given 仅分析/计划/评审，When 进入入口，Then 按请求交付，不自动编码；直接 testing 实施请求同样先完成记录。
- Given 必要合同或权限未满足，When 准备实施，Then 继续调查或记录阻断，不以对话 Todo 替代项目记录。
- Given 完成验证，When 交付，Then 结果、未运行项和风险写回项目记录，状态与导航索引一致，工程验证不冒充模型评测或人工接受。

## 自动记录路由补充（2026-10-02）

用户进一步明确：按整个 Project 框架自动选择并建立对应文档，不能只有 Task。已读取各模块 README、Requirement/Plan/Issue/Bug/Research/Verification/Context 模板以及 collaboration/decisions 入口。

- 做：Project 规范给出各类记录的事实触发条件、最小组合、关联及索引要求；intake 在所有工程路线执行文档选择和实际落盘，保留仅分析不编码边界；补充各模块路由场景并更新 Project 入口和发布说明。
- 验收：新产品目标进入 REQ；未决问题进入 ISSUE；有实际错误证据进入 BUG；独立研究结论进入 RESEARCH；阶段性取舍进入 PLAN；实施进入 TASK；可复用验证合同/基线进入 VERIFY；稳定交接信息进入 Context。已有条目续接，跨类型转换保留原证据和关联。collaboration 复用既有执行合同，decisions 仅索引 ADR；Policy waiver 按治理规则处理。
- 不做：为同一请求机械生成全套文档、更新所有历史记录或模板、扩大实现授权。继续主工作区串行文档维护，其他 Task 和共享发布说明的已有修改保持原样。
- 验证：本轮专项检查待执行；上一轮验证事实保留在下面，不将历史通过当作本轮结果。

## 本轮续接合同（2026-10-02）

本轮开始时 TASK-0164、intake、Project 规范和发布说明已有未提交修改；续接同一 concern，保留本轮开始时的成果及其他任务内容，不重复建单。复用 REQ-0004 / PLAN-0004；没有新增产品目标、独立调研或架构取舍，不额外创建 REQ/PLAN/RESEARCH/ADR。验证证据留在本 Task，不另建 VERIFY。

- 基线证据：本地 HEAD 的 intake 第 1 节允许“三五行合同”，未指定落盘位置；第 3 节允许实施的条件没有 Task 文件/状态检查。已有工作区补丁已修正这些缺口，但路由表与 Project 规范还存在单次性能结果必须写 VERIFY、文档工作默认写 RESEARCH/PLAN 等过度记录歧义。没有当时会话的工具轨迹，不能断言那次模型未记录的唯一原因。
- 本轮范围：前置记录闸门进入技能发现描述与正文入口；权威记录路由直接链接各目录及模板入口，厘清最小组合；补足文件回读、续接/中断和发现漏记时的真实补记；补场景，核对链接、模板、状态与发布说明。
- Given 直接提出小修改、修改技能/文档或从专项技能进入，When 首次编辑非管理交付文件，Then 已有与本次范围一致的 Task 合同及 in_progress 状态，并可由实际文件、索引和简要记录报告核对。
- Given 上下文续接或发现已先编码，When 继续修改，Then 先检查当前 Task；漏记则如实补记已有修改与缺失证据，不倒填日期或冒称记录在先。
- Given 只分析或请求持久化研究/计划，When 选择记录，Then 按事实选择最小必要文档，未获实施授权不创建实现或把规划状态当作实施。
- 执行：main 串行文档维护；读写范围沿用 frontmatter；无多 Agent、产品代码、全局技能、生产实例或收费调用。首次本轮编辑为本合同，后续再编辑交付文档。
- 验证计划：运行 workflow-skills、check-project-indexes、check-task-worktrees、check-agent-guide、check-skill-frontmatter、skill-creator quick_validate，以及本轮文档链接与 diff 检查；自审场景中的路由与首次编辑顺序。结果单独回写，不沿用前轮通过结论。

## 测试与验证

纯开发流程文档修改，无产品运行时变化，不新增单元测试。核对相对链接、命令、记录格式及状态索引；运行 workflow-skills、check-project-indexes、check-task-worktrees、check-agent-guide 和变更文档链接检查。逐项自审新增路由场景；静态检查不证明真实模型执行质量。

## 验收分层与交付记录（前轮保留）

- 工程验证：两轮文档专项检查均通过。第一轮（先记录后实施）：workflow-skills、check-project-indexes、check-agent-guide、check-skill-frontmatter（53 文件）、7 文档链接与 diff check 通过；当时全仓 check-task-worktrees 有两处既有冲突（TASK-0148 ∩ TASK-0122/0123）。第二轮（记录路由）：workflow-skills、check-agent-guide、check-skill-frontmatter、8 文档链接、diff check 通过；索引状态曾失配（README 未随 frontmatter 更新），已修复复验通过；`check-task-worktrees` 本次全量通过（164 task、0 warning），此前两处冲突已由相关工作所有者消除，与本次修改无关。
- 技术评审：自审实际 diff 与全部路由场景（含新增 9 个记录路由场景），确认各 Project 文档类型、续接、转换与最小组合均有对应步骤；无独立评审或真实模型试跑。
- 集成：pending；未提交。发布说明含其他会话持续写入的修改，提交需按协作规则核对归属后处理。
- 人工功能验收：待用户在后续真实开发请求中确认自动记录路由行为，本 Task 保持未完成状态。
- 发布：未授权，不推送或发布。
- 实际修改：Project 规范增加实施前记录政策；intake 更新描述、调查入口、持久化合同、实施准入、纠偏回写和交付步骤；testing 引用统一记录步骤；新增 9 个路由场景；同步 Task 索引与当前版本内部发布说明。
- 既有失败：`node scripts/quality/check-task-worktrees.mjs` 退出码 1，TASK-0122 ∩ TASK-0148 和 TASK-0123 ∩ TASK-0148 存在未登记的活动并行写范围冲突。通过 `loadTasks` 与 `findTaskTreeProblemsFromTasks` 核对，本次 TASK-0164 单独检查 0 error / 0 warning；全树与排除 TASK-0164 后的两项错误完全相同。未修改相关 Task、放宽守卫或登记豁免。
- 未运行：真实模型评测、Desktop、全量产品测试、构建、test:impact 和完整 TypeScript check；本次为无产品运行时变化的文档任务，专项验证按测试政策执行。静态场景自审不是实际模型评测。
- 已知限制：自然语言政策不能机械保证每个模型都遵循，需后续真实会话验证。全仓合同冲突须由对应工作所有者处理；发布说明原有内容保持原样。

## 功能验收包

后续新会话输入一个小修改或直接补测试请求；预期在首次代码/测试编辑前出现 Task ID、持久化合同及实施状态。继续既有 Task 时先更新记录。若直接编码、只写对话 Todo 或事后补记，按本 Task 反馈回流。

## 本轮交付与验证（2026-10-02）

- 实际修改：技能描述和正文入口前置记录闸门；路由分类回归 Project 规范单一事实源并补齐各目录/模板入口；明确最小文档组合、编号检查、回读与落盘简报、中断续接和漏记纠偏；新增 8 个边界场景及操作顺序观察方法；同步 Project 流水线、Task 状态索引及 v0.1.3 内部发布说明。本轮没有修改产品代码或 testing 技能，保留其已有修改。
- 工程验证：以下文档专项检查退出码均为 0。`node scripts/quality/workflow-skills.mjs`；`node scripts/quality/check-project-indexes.mjs`；`node scripts/quality/check-task-worktrees.mjs`（164 task，0 warning）；`node scripts/quality/check-agent-guide.mjs`；`node scripts/quality/check-skill-frontmatter.mjs`（53 文件）；`python -X utf8 C:/Users/xquan/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/open-forge-task-intake`。
- 链接与格式：使用仓库 `brokenFileLinks` 对本轮 7 个文档运行只读检查，相对文件链接、UTF-8/LF 均通过；`git diff --check -- <本轮已跟踪路径>` 通过。该链接检查不覆盖标题锚点；testing 指向 intake 第 3 节的既有标题未改名，关键锚点自审一致。
- 技术评审：自审本轮相对起始工作区快照的 diff 与场景；纠正文档/性能路线过度建档、仅规划也可以建 Task、Issue 结案未必需要实施和 ADR 三条件口径。无独立评审，无新会话模型评测。
- 集成：`pending`；未提交。本轮目标文件启动时已有同主题未提交修改，且共享发布说明包含其他工作；仅保留局部增量，不将这些既有修改夹带提交。没有推送、发布或操作 Worktree。
- 人工功能验收：尚未执行真实新会话验收，保持 `verifying`；使用上方验收包检查首次编辑前的记录顺序、最小组合与续接回写。场景自审不是模型已通过的证明。
- 未运行：产品单元/集成测试、test:impact、完整 TypeScript check、构建、Desktop 与真实 Provider；本次为无产品运行时变化的技能/文档修改，按测试政策采用文档专项验证，不新增运行时测试。
- 剩余风险：自然语言规则不能机械拦截文件写入；实际路由可靠性仍需后续真实会话确认。历史检查失败及修复过程保留在前轮记录，不视为本轮仍在失败。
## TASK-0171 主树收口（2026-10-02）

实现已原子提交到 main：a739e62b2。本轮完整 check 通过；组合测试 Desktop 4642、theme-ui 169、质量脚本 483 项通过，SSH 认证定向 32 项通过。CLI 首轮两例 RPC 超时保留于 TASK-0171；同一失败文件 13 项以及随后单独完整 CLI 226 项复验均通过，未改代码或阈值。各功能人工验收仍未执行，保留 verifying；待最终分支集成与推送闸门，不宣称已推送或发布。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
