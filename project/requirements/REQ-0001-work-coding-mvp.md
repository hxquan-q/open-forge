---
id: REQ-0001
type: requirement
status: ready
priority: P1
owner: product/runtime
source: exprot/mvp-scope.md; ISSUE-0006; project/tasks/TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0019, TASK-0024, TASK-0025, TASK-0026, TASK-0028
created: 2026-09-22
updated: 2026-09-23
related_requirement: []
related_plan: [PLAN-0001, PLAN-0006]
related_tasks: [TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0019, TASK-0024, TASK-0025, TASK-0026, TASK-0028, TASK-0059, TASK-0060, TASK-0061, TASK-0062, TASK-0063, TASK-0064, TASK-0083, TASK-0084, TASK-0102]
related_issues: [ISSUE-0006]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# work/coding 本地 Desktop MVP

## 用户问题

单次聊天可以回答问题，但用户要完成文档、文件、研究、数据或代码工作时，还需要明确的操作入口、可审查结果、受控副作用和可恢复的执行记录。若工作模式只改变布局，或 Task/Artifact/Permission 只留在界面状态中，用户无法可靠地完成并复查真实工作。

## 用户结果

个人专业用户和小团队可在本地优先的 Desktop 工作区中选择 `work` 或 `coding`，沿用同一套 Runtime、Session、TurnPipeline、Snapshot 和权限基础设施完成工作；计划、工具授权、结果、产物和恢复状态可见且可审查。

## 范围

- `work`：文档处理、文件批处理、本地研究/知识库、数据分析。
- `coding`：项目上下文、代码读取与修改、Diff/Review、Git、Shell、测试和 MCP。
- `Task`、`Artifact`、`Permission`、`Review` 作为产品层能力，共享既有 Runtime 合同。

## 不做什么

- 第二套 Agent Loop、Task Runner、Session 或 Turn 执行栈。
- 独立 Artifact 数据库，或由 Renderer 内存持有最终 Task 状态。
- 云端执行、云端会话/文件同步、多租户 SaaS，或默认上传用户本地资料。
- 根据普通聊天的自由文本复杂度自动创建 Task；Conversation → Task 规则以 [`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md) 为准。

## Given / When / Then

- Given：用户提出简单问题，或在普通 Chat 中提出多步骤请求；When：用户没有明确选择“升级为任务”，也没有启动注册的持久工作流；Then：请求仍按 Conversation 处理，不因 Prompt 文本或模型自行分类而创建 Task。
- Given：用户明确点击“升级为任务”或启动注册的持久工作流；When：Host 在当前 Session 创建 Task；Then：Activity Panel 显示任务状态，Runtime 将后续实际 Turn 绑定到 Task，应用重开后能从持久化事件恢复，取消/失败/Review 结果有明确状态。
- Given：用户从 `work` 入口选择本地资料；When：执行文档、批处理、研究或数据分析流程并审阅结果；Then：输入来源、校验问题、生成结果和 Review/导出状态可检查，未批准的写入不会覆盖来源。
- Given：用户在 `coding` 中选择项目；When：Agent 检查代码、生成修改、运行验证并请求必要的高风险授权；Then：Diff、测试结果和执行轨迹可审查，拒绝授权不会产生对应副作用。

## 必须保持

- `Task` 复用既有 Session/Turn 和 Runtime 生命周期；没有第二套 Agent Loop，Renderer 只投影状态。
- Task、Approval 和 Artifact 的持久事实可由事件重放；Artifact 文件内容是事实源，descriptor 保留来源、版本和 Review 关系。
- Tool Policy 在模型请求面和执行面都有效；`WorkspaceMode` 不授予文件、网络或命令权限，敏感写入仍受 Permission/Approval 约束。
- `work` 与 `coding` 的 Profile/Tool Catalog 不互相静默扩大。
- 默认不上传本地资料，不覆盖原始文件；取消、失败、部分成功和缺失来源必须如实呈现，不宣称未完成工作成功。

## 验收标准

1. **Work 四类流程均有独立的端到端验收**：
   - 文档处理：选择文档 → 生成总结/改写/翻译/纪要 → 预览和 Review → 导出；未 Review 前不写目标文件，原文默认不覆盖，重开会话可检查 Artifact 与来源（[`TASK-0028`](../tasks/TASK-0028-work-document-processing.md)）。
   - 文件批处理：选择文件 → 预览分类/重命名 → 明确确认后执行；拒绝、取消、部分失败与逐文件结果可见，重开会话可复查（[`TASK-0018`](../tasks/TASK-0018-work-mode-remaining-entries.md)）。
   - 本地研究：检索用户选择的资料 → 给出可回溯引用 → 用户 Review → 保存 `research-evidence` Artifact；缺失/变更来源不得编造，重开会话仍可追溯（[`TASK-0025`](../tasks/TASK-0025-work-mode-local-research.md)）。
   - 数据分析：导入受支持的 CSV/Excel/JSON → 展示格式/行级校验和结果预览 → Review 后导出带来源与版本的 `dataset`/`analysis` Artifact；不静默修复不确定数据或覆盖来源（[`TASK-0026`](../tasks/TASK-0026-work-mode-data-analysis.md)）。
2. **Coding 主流程可审查**：选择项目 → 查看上下文 → 修改生成 Diff → 运行测试/检查 → 展示结果；Git/Shell 等高风险操作经过对应 Policy/Approval，用户可接受、拒绝或要求调整（[`TASK-0019`](../tasks/TASK-0019-coding-mode-enhancement.md)）。
3. **Conversation / Task 边界明确**：普通 Chat 不自动升级；显式升级或注册工作流创建的 Task 绑定当前 Session，由 Runtime 将后续实际 Turn 关联到 Task，不另起执行栈；用户能看见 Task 状态、Review 与 Artifact，并在应用重开后恢复（[`TASK-0015`](../tasks/TASK-0015-task-artifact-vertical-slice.md)、[`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md)）。
4. **权限和数据安全可验证**：审批拒绝、取消、失败、无效输入、来源缺失或目标冲突不会静默写入或被报告为成功；默认不把本地文件上传到云端，所有真实副作用由既有 Tool Policy 和 Approval 控制（[`TASK-0016`](../tasks/TASK-0016-permission-approval-l0-l4.md)）。
5. **模式隔离与回归成立**：`work` 和 `coding` 入口分别呈现适用的工具/工作流；切换布局不静默改变既有 Session 的 Agent Profile 或授权；普通 Conversation/Turn 的既有行为不回归。

## 风险与失效条件

- 历史研究基线 [`exprot/mvp-scope.md`](../../exprot/mvp-scope.md) 曾把“多步骤请求升级为 Task”写成目标；Task 创建边界已由 [`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md) 裁决，验收以本 Requirement 和当前实现为准，不解释为自由文本自动分类。
- 文件格式、分析算法和研究来源的支持范围由对应纵向 Task 明确；未列入范围的格式或能力不得被暗示为已支持。
- 用户选择本地优先不等于所有 Provider 均离线；但本地资料不得在未经明确选择/授权时上传，缺失权限或不可恢复状态必须显式失败。
