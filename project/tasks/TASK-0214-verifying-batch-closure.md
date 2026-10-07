---
id: TASK-0214
type: task
status: done
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
integration_status: integrated
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

## 交付记录（2026-10-06）

- 分类结果（按证据分类，不按印象）：
  - 闭合 7 个：`TASK-0179` 与 `TASK-0180`（CI 基础设施，记录里有 CI 终验通过证据：quality 37060686088、desktop-packaged 37060686125）；`TASK-0209` 至 `TASK-0213`（CI、工具链、规则、文档与仓库设置，静态门禁与定向测试已实际执行通过）。七者均无用户可观察行为变化，按交付合同以「说明理由加既定完成标准」闭合，各自记录里加了收口小节。
  - 保持 verifying 的 72 个：绝大多数涉及产品行为、交互或协议，功能验收属于用户，Agent 不能代替。
  - 焦点表里明确写着「待人工验收」的行有 17 个；另有 16 个 verifying 任务根本不在焦点表里，且全是桌面端行为类（`TASK-0038/0051/0064/0074/0075/0120/0147/0152/0154/0155/0156/0157/0158/0160/0161/0194`），属台账缺口，本条如实记录。
  - 看似内部但未闭合的候选（例如 `TASK-0150` 原子写入重试）：记录里没有「无用户可观察行为变化」的证据，按保守原则不闭合——闭合判据第 1 条要证据，不要推断。
- 未做及原因：没有把任何面向用户行为的任务写成用户已验收。交付合同写明「用户尚未验收或拒绝时不能自行设 done」，且「内部任务人工验收不适用时说明理由及既定完成标准，不伪造用户已确认」。
- 剩余风险：72 个 verifying 里相当一部分自集成后没有被真正试用过（例如桌面端行为修复族 0188 至 0193）；拖得越久验收成本越高。本条只做了机械可判的那部分，其余需要用户实际验收，或由用户明确授权一种代替方式。
- 集成：闭合提交 `3094fbfa1`（第一批 5 个）与 `73be1f443`（第二批 2 个），本地 `main`；未推送。
