---
id: TASK-0009
type: task
status: done
priority: P0
owner: release/product
requirement: REQ-0003
plan: PLAN-0003
execution: coordination-only
branch: none
worktree: none
base_commit: forge/dev
read_paths: [exprot/rebrand-plan.md, exprot/development-paradigm.md]
write_paths: [project/issues, project/plans]
exclusive_paths: [.github/release-notes]
depends_on: []
conflicts_with: []
integration_status: done
created: 2026-09-22
updated: 2026-09-22
---

# 品牌化关键决策冻结

## 阻塞项

在域名体系、更新基建、Marketplace、协议 scheme、appId、数据目录和 npm scope 未冻结前，不进入 P0 品牌身份施工。

## 输出

- 15 项决策的最终值；
- 迁移和重新授权影响；
- 更新源与安装身份的硬校验要求；
- 上游同步和冲突预算。

详细候选和代价见 [`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md)。

## 交付记录

- 15 项决策全部冻结，最终值与迁移影响记入 [`ISSUE-0001`](../issues/ISSUE-0001-rebrand-infrastructure-decisions.md)；
  关键外部输入由 owner 确认：暂无自有域名（GitHub 反域过渡）、更新走 `hxquan-q/open-forge` Releases、
  Marketplace 用 `hxquan-q/open-forge-marketplace`、对外 npm scope `@openforge`。
- 更新链 ship-blocker 已顺手落实：generic provider 改为 fail-closed（缺 `VETTA_UPDATE_URL` 直接构建失败，
  删除上游默认 feed）、开源默认坐标改 `hxquan-q/open-forge` 并加回归测试钉死、workflow 注入坐标同步、
  内置 Marketplace 常量与 Linux 打包元数据改 Open Forge 身份。
- 验证：packaging/update-feed/inno-installer node-test 28 项通过；marketplace-source-store 20 项通过。
