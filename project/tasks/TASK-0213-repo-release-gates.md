---
id: TASK-0213
type: task
status: done
priority: P1
owner: release/product
source: user-request（明确授权代改仓库设置）
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: [TASK-0211]
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3e1a43e13
read_paths: [docs/release/desktop-release-runbook.md, .github/workflows/desktop-release.yml, project/tasks/TASK-0211-release-gate-and-settings-checklist.md]
write_paths: [docs/release/desktop-release-runbook.md, project/tasks/TASK-0211-release-gate-and-settings-checklist.md, project/plans/PLAN-0016-version-management-release-refactor.md, project/tasks/TASK-0213-repo-release-gates.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-06
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 落地仓库侧发布门禁：Environment 审批与 tag 保护

## 目标与范围

TASK-0211 只出了配置清单。本次用户明确授权代改仓库设置，把清单落成实际配置。

做：

- 给 `desktop-production` 加 required reviewers（`hxquan-q`），并保持允许自审——否则唯一责任人会被锁在自己的发布之外。
- 创建 `desktop-test` 并配同样的审批；workflow 在 test 渠道已经引用它，此前该环境并不存在。
- 加一条 `v*` tag 的 ruleset：限制删除与改写，`hxquan-q` 作为 bypass actor，不影响正常打 tag 与发版。
- 同步三处文档：发布手册的「当前实际配置与待配置项」、TASK-0211 里「不代改仓库设置」的表述、PLAN-0016 阶段 6。

不做：不改 workflow；不去掉 `can_admins_bypass`（保留管理员兜底，避免配置失误把发布卡死）；不新建除 `desktop-test` 以外的环境；不执行发布。

## Given / When / Then

- Given `desktop-production` 此前没有 protection rules；When 责任人触发正式发布；Then 发布作业等待一次人工批准。
- Given `v*` tag 此前没有任何规则限制；When 有人尝试删除或改写已发布的 tag；Then 被 ruleset 拒绝，而责任人的 bypass 不受影响。

## 必须保持

- 不改动上一条之外的既有仓库设置；每步改动后用 API 读回核对，并在交付记录里留下回退命令。
- 若某项配置失败或被平台拒绝，如实记录，不写成已完成。

## 测试与验证

- `gh api repos/hxquan-q/open-forge/environments` 与 `.../rulesets` 读回核对。
- `bun run check`（文档改动）。

## 交付记录（2026-10-06）

- 实际改动（均已用 API 读回核对）：
  - `v*` tag ruleset：`POST /repos/hxquan-q/open-forge/rulesets` 得到 id `24519581`，name `protect release tags`，target `tag`，enforcement `active`，rules 为 `deletion` 与 `update`，bypass 为 `RepositoryRole` id 5（仓库管理员）`always`。未限制 `creation`，所以正常打 tag 与发版不受影响。
  - `desktop-test` 环境：`PUT /repos/.../environments/desktop-test` 创建成功（此前不存在，而 workflow 的 test 渠道引用它）。
- 未能落地、按实测订正的一处：两个发布环境的 required reviewers 被平台拒绝——`PUT .../environments/desktop-production` 返回 422「Please ensure the billing plan supports the required reviewers protection rule」。仓库为私有、账户计划不支持该保护规则。因此环境审批在当前计划下拿不到，可用的人工门是 tag ruleset 加本地 `publish --confirm-publish` 两道；`environment:` 声明本身不构成审批，已在 runbook、TASK-0211 后续说明与 PLAN-0016 阶段 6 写明，没有写成已配置。
- 回退命令（需要时）：
  - 删除 tag ruleset：`gh api -X DELETE repos/hxquan-q/open-forge/rulesets/24519581`
  - 删除 test 环境：`gh api -X DELETE repos/hxquan-q/open-forge/environments/desktop-test`（`desktop-production` 未做任何改动）
- 验证命令与结果：
  - `gh api repos/hxquan-q/open-forge/rulesets`：列表含 24519581，target tag、active；详情显示 rules 为 deletion 与 update、bypass 为 RepositoryRole 5。
  - `gh api repos/hxquan-q/open-forge/environments`：返回 desktop-production 与 desktop-test，两者均无 protection rules。
  - `bun run check`：exit 0（含声明头 ratchet new=0）。
- 未运行及原因：未实际触发一次发布来验证 tag 规则与发布流程的相互作用（需要真实发布授权）；未升级账户计划，故 required reviewers 仍不可用。
- 剩余风险：环境审批缺失意味着「谁推 tag 谁在发版」。本条堵住了 tag 的删除与改写，但**创建** `v*` tag 仍只受仓库写权限约束——本仓除所有者外还有一个 `write` 权限的协作者（`Chen17841967503`），所以这个口子不是理论风险。要更严需再加 `creation` 限制（仓库管理员 bypass，所有者不受影响），或改用受保护的 PR 流程产出 tag；是否加属于会影响协作者的治理决定，交用户定。
- 集成：实现提交 `5fc62a929`（本地 `main`），`integration_status: integrated`；未推送、未发布。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI、工具链、规则、文档或仓库设置，无用户可观察行为变化；既定验收标准（静态门禁与定向测试）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
