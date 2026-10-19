---
id: ISSUE-0029
type: issue
status: blocked
priority: P1
owner: release/product
related_requirement: []
related_plan: []
related_tasks: [TASK-0183, TASK-0184, TASK-0180, TASK-0182, TASK-0179, TASK-0321]
related_issues: []
related_bugs: [BUG-0066, BUG-0067]
source: CI run annotations (hxquan-q/open-forge, 2026-10-03 起)
created: 2026-10-05
updated: 2026-10-19
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# fork 的 GitHub Actions 预算耗尽，全部 workflow 秒败

## 背景

本仓 `hxquan-q/open-forge` 的 GitHub Actions 自 2026-10-03 15:07 起，所有 workflow 在 3–8 秒内失败，annotations 原文：

```text
X The job was not started because an Actions budget is preventing further use.
```

涉及 `quality`、`desktop-packaged`、`docs-site`、`mobile` 等；更早的运行（37059120967 等，2026-10-02）仍真跑作业。BUG-0066 建档时也记过「此前被 billing 拒启」。

## 已知事实

- 这是账户/仓库级计费与预算限制，不是代码、工作流语法或 runner 问题：失败发生在 job 启动之前。
- 影响面：所有依赖「CI 复跑绿」作为验收证据的 Task，包括 TASK-0183/0184（BUG-0066/0067）、TASK-0180/0182/0179 等「CI 复跑待证」条目。
- 不影响本地验证：单元/定向测试、`bun run check`、`bun run --cwd apps/docs-site build` 等仍可在本机执行并作为本地证据。
- 历史 job 日志与 artifact 仍可经 API 读取（`gh run view <id> -R hxquan-q/open-forge`），本次两处根因即由此取得。

## 未决问题

- 是恢复该 fork 的 Actions 预算（付费/提额），还是把 CI 校验迁到其它执行环境？
- 在预算恢复前，相关 Task 的验收标准是否接受「本地证据 + 待 CI 复跑」的中间态？

## 候选方案与取舍

- 恢复预算：最省事，保持现有 workflow 与证据链；需要用户/账户侧的付费或额度决策，Agent 不能代办。
- 迁移 CI 到自托管或其它托管：绕开预算，但要维护 runner、凭证与缓存，成本更高。
- 暂缓：允许 Task 以本地证据推进，CI 复跑作为遗留验收项；风险是长期无端到端绿基线。

## 推荐方案

先由用户决定是否恢复预算。在此之前，允许 TASK-0183/0184 等以本地/单元级验证推进实现，并把「CI 复跑绿」明确记为待办验收项，不谎称已通过。

## 决策（2026-10-19）

用户决定保留 open-forge 的有效反馈，同时压缩额度消耗：

- `dev` push 只运行 `check + quality tests`（ubuntu）；三平台单测矩阵改为 PR / 手动触发；
- desktop-packaged 移除 `dev` push 触发，改为 PR / 手动触发；
- 名下其他私有仓库的 Actions 已停用：`dyp`、`ShunX`、`xiaoai`、`weallstar`；public 仓库的 Actions 不消耗私有仓库分钟数，未停用；
- 预算本身仍由用户在账户侧提高 spending limit 或等待账期重置，Agent 不能代办。

执行记录见 [TASK-0321](../tasks/TASK-0321-ci-budget-trigger-slimming.md)。

## 决策触发条件

用户就 Actions 预算或 CI 承载方式给出方向时，更新本条并把受影响 Task 的验收路径落定。

## 后续可能拆出的 Requirement/Task

- 若迁移 CI：新增 CI 承载迁移的 Task。
- 若恢复预算：无需新 Task，仅更新受影响 Task 的验证记录。
