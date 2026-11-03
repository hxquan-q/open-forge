---
id: BUG-0176
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: 用户实机验收反馈（2026-10-30，code+agent-team 新会话）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0438, TASK-0428]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Team 会话工作区校验不含开发册项目

## 用户流程与实际行为

- code 模式经新会话页选 agent-team 目标（项目取自开发册）发首条消息 → 主进程创建团队会话抛 `Selected Team workspace project is unavailable`，消息发不出去。

## 环境与失败证据

- 用户 dev 实机（2026-10-30 控制台：`vetta:agent-teams:cr…` 反复失败）。
- 根因：`team-workspace.ts:48` 的 `listProjectPaths` 只读 `config.projects`；F08 后开发册项目可被选为新建目标，但 `resolveTeamSessionWorkspace` 的项目校验名单不含 `config.allstarProjects`（`team-workspace.ts:62-63`）。

## 最小复现

1. 开发册登记一个普通册没有的目录 → code 新会话页选 agent-team → 发消息。

## 影响

开发册项目上完全无法开团队会话（P1，F08 后置缺口）。

## 根因证据

源码对照如上；报错串与 throw 文本一致。

## 回归测试

- `resolveTeamSessionWorkspace` 对开发册路径返回 project 工作区（mock config，旧实现红）；普通册路径行为不变。

## 修复与验证

- 修复：`team-workspace.ts` 默认 `listProjectPaths` 合并 `config.allstarProjects`；普通册行为不变，名单外仍拒绝。
- 测试：新 `team-workspace.test.ts` 开发册用例在 HEAD 版本实测红（临时还原实证）→ 修复绿 2/2。
- 检查：`check:quick` 通过（ratchet new=0，补 fork 声明头；Biome 格式经仓库 fix 入口修正）。
- 未运行及原因：实机复验待用户（开发册项目上发起团队会话）。
