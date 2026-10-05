---
id: TASK-0214
type: task
status: in_progress
priority: P2
owner: coordinator
source: user-request（「帮我验收」）
related_requirement: []
related_plan: []
related_tasks: [TASK-0209, TASK-0210, TASK-0211, TASK-0212, TASK-0213]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 6cf889258
read_paths: [project/tasks, project/tasks/README.md]
write_paths: [project/tasks, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 台账收口：verifying 批次分类与内部任务闭合

## 目标与范围

用户要求「帮我验收」。按交付合同，功能行为、体验与 AI 结果的验收属于用户，Agent 不能代替，也不能把「已验收」写成用户确认；内部任务在说明理由与既定完成标准之后可以闭合。本 Task 只做能合法做的两件事：把 verifying 批次按证据分类；对本轮自己交付、验证完整且无用户可观察行为变化的内部任务按其既定标准闭合。

做：分类全部 verifying 条目；闭合 TASK-0209 至 TASK-0213。

不做：不把任何面向用户行为、交互或协议的任务标成用户已验收；不闭合工程验证尚未完成的条目——例如 CI 复跑仍受 ISSUE-0029（Actions 预算）阻塞的 TASK-0183 与 TASK-0184；不闭合引入面向用户行为变化的 TASK-0208（allstar-coding v0.4 的 ac-fence 会拦截工具调用）。

## 分类判据

闭合必须同时满足三条：

1. 改动无用户可观察行为变化（CI、工具链、规则、文档或仓库设置）；
2. 既定验收标准已实际执行并通过（不是「应该会过」）；
3. 记录里已列明未运行项与剩余风险。

不满足第 2 或第 3 条的、以及涉及产品行为或交互的，保持 `verifying`，连同「要看什么」一起交给用户。

## 交付记录

待实施。
