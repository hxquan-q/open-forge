---
id: TASK-0216
type: task
status: done
priority: P2
owner: coordinator
source: user-request（「验收方式」决策：分层）
related_requirement: []
related_plan: []
related_tasks: [TASK-0214]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: c2931b2e3
read_paths: [project/tasks, project/tasks/README.md]
write_paths: [project/tasks, project/tasks/README.md, project/verification]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 分层验收：闭合工程合同面并产出行为面验收清单

## 目标与范围

用户在「剩下 72 个 verifying 条目怎么验收」上选择了分层：产品行为面由用户试用，纯工程合同面由 Agent 按工程证据闭合（记录写明是按用户授权，不是用户已确认）。本 Task 落实这条决策。

分类判据只有一条，避免逐案猜测：**改动是否会改变用户可观察的输出、界面、交互、安装或更新流程、AI 行为**。会，属行为面，保持 `verifying` 并进入验收清单；不会，属合同面——验收对象是测试、守卫、契约或台账本身——按既定标准闭合。

分类结果：合同面 17 个（0137、0138、0139、0140、0141、0164、0150、0173、0174、0175、0182、0187、0196、0198、0199、0205、0206），行为面 53 个，另有 2 个（0183、0184）既非内部也无完整验证——它们的 CI 复跑仍受 ISSUE-0029 的 Actions 预算阻塞，单独标注不闭合。

做：闭合合同面 17 个并在记录里写明授权依据；把行为面 53 个整理成验收清单（`project/verification/`），标明看什么、入口与预期。

不做：不闭合任何行为面条目；不闭合工程验证尚未完成的 0183、0184；不把「按用户授权」写成「用户已确认」。

## Given / When / Then

- Given 某条目改动不改用户可观察输出；When 其既定验收标准已实际执行通过；Then 按既定标准闭合，记录注明授权来源。
- Given 某条目会改变用户可观察行为；When 用户尚未反馈；Then 保持 `verifying`，只在验收清单里出现。

## 必须保持

- 每条闭合都要有证据，不靠推断；看不到「无用户可观察行为变化」证据的，一律归行为面。
- 不减少任何记录里的未运行项与剩余风险。

## 测试与验证

- `bun run check`（含索引一致性）。
- `gh api` 无关；本轮不涉及仓库设置。

## 交付记录（2026-10-06）

- 分类（判据：是否改变用户可观察的输出、界面、交互、安装或更新流程、AI 行为）：
  - 合同面 17 个已闭合：0137、0138、0139、0140、0141、0164、0150、0173、0174、0175、0182、0187、0196、0198、0199、0205、0206；每条记录注明「按用户授权闭合，不是用户已确认」。
  - 行为面 53 个保持 verifying，进入 `VERIFY-0017` 的验收清单（五组，逐条给出看什么与触发方式）。
  - 2 个（0183、0184）既非合同面也无完整验证：CI 复跑仍受 ISSUE-0029 阻塞，在清单里单独标注。
- 编号事故与更正：本任务原用 TASK-0215，与另一执行流的 TASK-0215-session-command-tool-visibility 撞号；按「编号已被占用则重新分配、不覆盖现有条目」改为 TASK-0216，并同步了 17 条收口注记与焦点表引用。
- 操作失误（如实记录）：提交 272808ea0 用 `git add project/tasks/` 暂存，把另一执行流当时未跟踪的 `project/tasks/TASK-0215-session-command-tool-visibility.md` 一并带进了提交（文件内容未被改写）。这违反「暂存时逐个列出具体路径、不夹带他人内容」。补救选项交用户：保留现状，或以追加提交撤回该路径（本仓禁止未经明确要求的 amend）。
- 验证：`bun run check` 本次未能全绿，失败点不在本任务改动，而在另一执行流的两处在途内容——TASK-0215-session-command-tool-visibility.md 声明 `execution: serial` 却带 `worktree` 字段（task-worktrees 守卫红），以及未跟踪的 `BUG-0079` 缺声明头（声明头 ratchet new=1）。两处都属他人在途内容，未代为修改。
- 未运行及原因：用户的实际验收未发生，这正是本任务要交给用户的部分；Agent 不能代替。
- 剩余风险：55 个 verifying 中 53 个等用户验收，2 个等 Actions 预算恢复后 CI 证据；另有两处他人在途的守卫红待其 Owner 处理。
- 集成：闭合提交 `272808ea0`，本地 `main`；未推送。
