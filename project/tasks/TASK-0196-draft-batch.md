---
id: TASK-0196
type: task
status: done
priority: P1
owner: coordinator
source: user-request; RESEARCH-0022; 存量 draft 台账
related_requirement: [REQ-0008, REQ-0001, REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0038, TASK-0039, TASK-0042, TASK-0051, TASK-0152, TASK-0154, TASK-0155, TASK-0156, TASK-0157, TASK-0158, TASK-0159, TASK-0160, TASK-0161, TASK-0166, TASK-0167]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0196-draft-batch
worktree: ../open-forge-wt/task-0196-draft-batch
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [project/tasks, project/plans/PLAN-0014-selective-upstream-nonmobile.md, project/research/RESEARCH-0022-upstream-nonmobile-gap-audit.md, apps/desktop/src, packages]
write_paths: [project/tasks, .github/release-notes, apps/desktop, packages]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0181]
integration_status: integrated（批末合并 main adeaa5294，随 0356daf39 推送 origin/dev）
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 存量 Draft 批次：专用工作树串行实施与逐项 dev 集成

## 目标

在一个专用 Worktree 内串行完成台账中全部 15 个未实施 draft Task（每个子 Task 遵守自身合同与验证闭环），每完成一项即原子提交并 fast-forward 推送 `origin/dev`；全部完成后整合远端 dev 并合入本地 `main`。本 Task 只拥有批次协调、记录与集成，不替代子 Task 合同。

用户本轮明确授权：逐项验证通过后推送本批候选至 `origin/dev`，批末合入本地 `main`。该授权不涵盖 `origin/main`、`upstream`、force push、tag、Release 或发布制品。用户声明当前模型无视觉能力：本批不做任何视觉校验（不运行 `verify:ui:*`、不截图比对），UI 行为一律以组件/合同/集成测试证明；人工视觉与功能验收仍归用户，各子 Task 保持 verifying 直到用户接受。

## 范围与批次顺序

纳入（15）：TASK-0042、TASK-0167、TASK-0166、TASK-0039、TASK-0154、TASK-0155、TASK-0157、TASK-0158、TASK-0159、TASK-0051、TASK-0038、TASK-0152、TASK-0156、TASK-0160（剩余部分）、TASK-0161。

排除：TASK-0151（配置串行事务主体由 TASK-0187 批次实施，勿重复）；TASK-0160 的 Git 特殊路径/重命名部分（TASK-0187 的 TASK-0193 实施）；6 个 blocked 任务不在本批。

顺序依据（依赖 + 与 TASK-0187 活动面的冲突最小化，可按实际落地调整并回写）：

1. 低冲突独立片：0042（powerMonitor）→ 0167 → 0166（SSH 线）→ 0039（webview 收口）。
2. 上游适配：0154（MCP 作用域）→ 0155（提示词优先级，依赖 0154）。
3. 新能力：0157（富 Markdown）、0158（脚本面板，依赖 0167）。
4. 决策项：0159（沙盒制品源需用户决策，届时带建议单独询问，不阻塞其余项）。
5. 会话/内存域（待 TASK-0187 首批切片落地并合入 dev 后实施，降低 message-list/message-stream/runtime-host 同域冲突）：0051 → 0038 → 0152（feed/attach 合同先扩充再实施）→ 0156（依赖 0152+0155）。
6. 尾项：0160 剩余（未装 Git 恢复入口，待 TASK-0193 落地）、0161（依赖 0151 落地）。

### 并发评估

- 结论：条件支持（单 Agent、单专用工作树，内部全串行，不派实现 Worker）。
- 执行方式：parallel（隔离 Worktree）/ 内部 serial。
- 与 TASK-0181（及记录暂未入库的 0186/0187/0194-0197 线）共享 `.github/release-notes/v0.1.3.md`、`project/tasks/README.md` 与 apps/desktop 部分路径：入库任务已在本端登记 `conflicts_with`（未入库记录待其落地后补登）；通过 dev 逐项集成 + 合并解决，不覆盖他方修改。
- Branch：`task/TASK-0196-draft-batch`；Worktree：`../open-forge-wt/task-0196-draft-batch`；基线：本地 main `48b8e487f`。
- 集成顺序：每子 Task 验证通过 → 原子提交（pathspec）→ `git fetch origin` 审核 `origin/dev..HEAD` → 远端前进则先合并 `origin/dev` 并复验受影响面 → fast-forward `git push origin HEAD:dev`；批末完整 `bun run check` 后合入本地 main 并复验。

### 做

- 每子 Task：续接原合同 → 必要时按 RESEARCH-0022 证据扩充合同（如 0152 的 feed/attach）→ red/green → 定向 + `test:impact`（跨包加 `test:changed`）→ `check:quick` → 记录与发布说明回填 → 原子提交 → 推 dev。
- 子 Task 状态翻转时同步本批与该 Task 的 frontmatter、`project/tasks/README.md` 焦点表。

### 不做

- 不整仓 merge/cherry-pick 上游；不移植手机远程；不撤销窗口化、分页、缓冲限额、MCP 回收等本仓既有能力。
- 不启动真实 Desktop/Provider/SSH/用户状态；不产生费用；不做视觉校验（用户声明模型无视觉）。
- 不实施 0151 主体与 0160 的 Git 特殊路径部分（归 TASK-0187 批）；不动 6 个 blocked 任务。
- 不降低测试/门禁标准；不为绿灯删断言。

## Given / When / Then

- Given：本地 main `48b8e487f` 及台账中 15 个 draft 合同；TASK-0187 批次并行推进并同样逐项推 dev。
- When：按上述顺序在专用工作树逐项实施、验证、提交并 ff 推送 `origin/dev`。
- Then：每个子 Task 的目标行为有可失败回归与正常入口流程证据，原错误/取消/权限/usage/持久化合同不退化；dev 上每次推送均为已验证提交；批末本地 main 包含全部子 Task 且完整 check 通过。

## 必须保持

- 各子 Task 合同中的不变量优先；上游适配保留下列本仓能力：历史窗口化/分页（TASK-0050）、4096 replay 上限、乐观消息因果顺序、原子写重试、SSH 平台合同、队列顺序修复（TASK-0185）。
- 提交纪律：中文多行、显式 pathspec、提交前三步核对（status / diff --staged / log 风格）、不 amend、不夹带他方文件；共享文件（发布说明、焦点表）合并时保留双方内容。
- 推送纪律：仅 fast-forward；远端分叉先合并复验再推；失败即停不强推。

## 测试与验证

- 子 Task 级：其合同中的定向命令 + `bun run test:impact -- <实际变更文件>` + `bun run check:quick -- <文件>`；跨包/公共合同加 `test:changed`。
- 批次级：每个推送前审核提交清单；批末（以及会话/内存域阶段开始前）完整 `bun run check`；0159 涉及打包脚本时另跑 `bun run test:desktop:packaging` / `verify:desktop:contracts`。
- 不运行：`verify:ui:*`（无视觉能力且未授权）、真实 Provider/SSH、发布构建。

## 验收分层

- 工程验证：逐子 Task 记录实际命令与结果；未执行项如实登记。
- 技术评审：每子 Task 自审 diff 与合同；发现的问题回写该 Task。
- 集成：逐项推 dev 后在子 Task 登记 `integration_status: integrated` 与推送 SHA；批末合入 main 时复核。
- 人工功能验收：全部待用户（含视觉验收，本批模型无视觉不做代办）；状态保持 verifying。
- 发布：未授权。

## 功能验收包

- 入口：各子 Task 合同定义的用户流程；批次交付时汇总每项的验收步骤、预期行为与已知限制。
- 不通过表现：按子 Task 记录；反馈关联原 Task 重开，不并入本伞任务。

## 交付记录

- 实际修改/运行/风险随每子 Task 回填；本文件维护批次进度表、推送 SHA 与阶段结论。

### 批次进度

| 子 Task | 状态 | 实现/推送 |
|---|---|---|
| TASK-0042 | verifying（已集成） | e21ebaa26，随 ca6c9df9d/e1605e4d2 推送 origin/dev |
| TASK-0167 | 实施完成，门禁进行中 | 待批次门禁（test:changed + check）后提交推送 |

### 泳道分配（2026-10-03 用户授权三工作树并行）

执行方式自「单树串行」升级为条件并行：Coordinator（本 Task，树 task-0196-draft-batch）保留会话/内存域链条与最终 main 合并权；三条新泳道各建独立 Worktree，由用户手动指派的会话执行。所有泳道遵守同一逐项推送协议；共享文件（发布说明、tasks/README、dev 分支）靠 ff+合并解决。

| 泳道 | Worktree（待建） | 任务序列 | 边界 |
|---|---|---|---|
| A（Coordinator） | task-0196-draft-batch | 0167 收尾 → 0166 → 0051 → 0038 → 0152 → 0156 → 0160 剩余 → 批末合并 main | 会话/消息域独占 |
| B | task-TBD（0154 记录定名） | 0154 → 0155 → 0161（0151 落地后） | runtime-desktop / coding-agent prompts / desktop 通知 |
| C | task-TBD（0157 记录定名） | 0157 → 0158（0167 落地后） | theme-ui / canvas sandbox / presets/scripts |
| D | task-TBD（0039 记录定名） | 0039 → 0159（开工先取用户制品源决策） | webview/activity-panel / 打包脚本 |

泳道 B/C/D 的子任务翻状态时由各自 Worker 更新其 Task 记录与 README 行；本伞任务只跟踪聚合进度。各泳道不得触碰泳道外任务的 write_paths。

### 协调事件

- 2026-10-03：与 open-forge-bb 会话互让任务编号（对方 0194/0195/0197/0198，我方 0196）；BUG 编号对方已用到 0072，本批如需登记从 0073 起先扫描再取。
- 2026-10-03：HEAD 已提交的 README 焦点表存在悬空 TASK-0186 行（记录未入库），已在 44e0c6887 移除，待其 Owner 提交记录后随合并恢复。

### 批次收尾（2026-10-03）

- 14/15 完成（0159 用户决策暂缓），全部逐项推送 origin/dev；批末合并入本地 main（adeaa5294）并推送 dev 同步。
- 主树过时状态记录处置：泳道 B/C 停止后残留在主树的 TASK-0154/0157/README 未提交副本描述的状态与事实相反（其工作已在 dev 完成），经用户确认恢复为 HEAD 后合并。
- 主树仍有并行会话（0187/harness 线）的未入库记录与未提交索引修改，其集成由各自会话负责；本批不代提交。
- 人工功能验收：全部子任务保持 verifying 待用户；视觉验收未做（模型无视觉）。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
