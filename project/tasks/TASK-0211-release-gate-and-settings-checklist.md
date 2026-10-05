---
id: TASK-0211
type: task
status: done
priority: P2
owner: release/product
source: user-request；PLAN-0016 阶段 5 与 6
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: [TASK-0209, TASK-0210]
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 8ad2cfaaa
read_paths: [docs/release/desktop-release-runbook.md, .github/workflows/desktop-release.yml, project/plans/PLAN-0016-version-management-release-refactor.md]
write_paths: [docs/release/desktop-release-runbook.md, project/plans/PLAN-0016-version-management-release-refactor.md, project/tasks/TASK-0211-release-gate-and-settings-checklist.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 发版人工门与仓库设置清单成文

## 目标与范围

PLAN-0016 的阶段 5 与阶段 6。用户口径是「发版由人发起、开发规范要扎实」。本 Task 只做记录与文档，不改工作流行为。

做：

- 在 `docs/release/desktop-release-runbook.md` 把「谁能发起发布、哪一步是人工门」写成明确条目，并补一份经实测的仓库设置清单。
- 在 PLAN-0016 记录阶段 5 的取舍结论（保留本仓现有的直发模型并列出补偿控制，还是恢复上游的 pending 加 desktop-promote 两步门）与阶段 6 清单的落点。

不做：不改 `.github/workflows/*`；不代改仓库设置（ruleset、Environment、tag 保护）；不执行发布。

## 实测到的现状（2026-10-05）

- `GET /repos/hxquan-q/open-forge/environments` 只返回 `desktop-production`，其 `protection_rules` 是空数组、`can_admins_bypass` 为 true；`desktop-test` 尚未创建，而 workflow 在 test 渠道会引用它。
- `GET /repos/hxquan-q/open-forge/rulesets` 返回空数组；`main` 的分支保护接口返回 404，即未保护。
- 结论：当前的人工门只有本地 `release:desktop:publish` 推 tag 这一步。workflow 里的 `environment:` 声明因为没配 required reviewers，起不到审批作用；`v*` tag 也没有规则限制谁能创建。runbook 里「建议启用 required reviewers」的措辞与现状有落差。

## Given / When / Then

- Given 现状是「无审批、无 tag 保护」；When 读者打开 runbook 的发布章节；Then 能一眼看到人工门在哪、哪些设置还没配、配置项该填什么。
- Given PLAN-0016 的阶段 5 需要取舍；When 读完记录；Then 清楚本仓选了哪个模型、代价是什么、要改回去需要做什么。

## 必须保持

- 文档只描述现状与要求，不把「建议」写成「已启用」，也不宣称未配置的门禁已经生效。
- 不改工作流行为，不触碰仓库设置。

## 测试与验证

- `bun run check`（文档改动走静态门禁与链接检查）。
- 逐条对照 `gh api` 的实测输出，避免夸大现有门禁。

## 交付记录（2026-10-06）

- 实际修改：
  - `docs/release/desktop-release-runbook.md`：新增「当前实际配置与待配置项（2026-10-05 实测）」小节，逐项列出 Environment、tag ruleset 与分支保护的现状与应有配置；在「正式发布操作」前写明发起权限；并补上声明头——本次改动使它成为 fork 修改文件。
  - `project/plans/PLAN-0016-version-management-release-refactor.md`：阶段 1、2、4 标记完成；阶段 3 标记未开工并写明开工前需定的两件事（既有条目是否迁移、从哪一版起生效）；阶段 5 定为保留直发模型并写明补偿控制与改回两步门所需工作；阶段 6 指向 runbook 的清单。
  - `project/plans/README.md`：PLAN-0016 行状态与 frontmatter 同步为 in_progress。
- 验证命令与结果：
  - `bun run check`：exit 0（含声明头 ratchet new=0 与 check-project-indexes）。
  - 现状数据逐条取自 `gh api repos/hxquan-q/open-forge/environments`（只返回 desktop-production，protection_rules 为空）、`.../rulesets`（空数组）与 `.../branches/main/protection`（404）。
- 未运行及原因：未改任何 workflow、未代改仓库设置（ruleset、Environment、tag 保护）、未执行发布。
- 剩余风险：文档已写明「声明 environment 不等于有人工门」，但门禁本身仍待用户在仓库设置里补齐；补齐前，发版约束完全依赖「谁推 tag 谁在发版」这条纪律。
- 集成：实现提交 `ed4c31afb`（本地 `main`），`integration_status: integrated`；未推送、未发布。
- 后续（TASK-0213，2026-10-06）：用户明确授权代改仓库设置。`v*` tag 的删除与改写 ruleset 已落地（id 24519581，仓库管理员 bypass），`desktop-test` 已创建；两个发布环境的 required reviewers 被 GitHub 以 422 拒绝，当前计划不支持。本 Task 写的「不代改仓库设置」只约束该 Task 当时的范围。

## 收口（2026-10-06，TASK-0214）

- 本任务的改动属 CI、工具链、规则、文档或仓库设置，无用户可观察行为变化；既定验收标准（静态门禁与定向测试）已实际执行并通过；人工功能验收不适用。按交付合同以「说明理由加既定完成标准」闭合。
