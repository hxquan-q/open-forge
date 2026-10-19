---
id: WAIVER-0005
rule: project/collaboration/development-workflow.md 的本地集成前干净工作区及一次一个 Task 政策
status: resolved
owner: project/agent-workflow/coordinator
reason: PLAN-0019 四个连续依赖 Task 按统一候选验证；主树另有七个他人未跟踪 temp 文件，清理它们会侵犯改动归属
risk: 组合候选较大；保留未跟踪文件时必须阻止任何路径碰撞与意外夹带
compensation: 仅本次本地合并；受版本控制的文件须干净，temp 精确清单不变，保护 ignored 文件，最终完整影响测试与 check 通过才提交；失败保留分支并中止合并；推送和发布授权及干净工作区要求不豁免
created: 2026-10-19
expires: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# PLAN-0019 本地组合集成的有限例外

本条只豁免本次 Coordinator 本地合并的两项 Policy：单次合并一个 Task、工作区没有任何未跟踪文件。Task 的原子提交边界保留，组合包含 TASK-0322 `cf79dd504`、TASK-0323 `47b1e8e86`、TASK-0324 `c22ccc1c5` 及 TASK-0325 的最终原子提交，采用一次可审查的 no-ff 合并候选执行完整组合验证。

## 保留清单

下列七个他人文件保留在原处，不读取内容、不移动、不删除、不忽略、不暂存或提交：

- temp/checks17.json
- temp/jobs17.json
- temp/log/team-chat-perf-bug-report.md
- temp/low-integrity-label-full-report.md
- temp/merge-tree.txt
- temp/pr15-timeline.json
- temp/pr17.json

## 操作条件

1. 只清理本会话创建、已核对并由 Task 分支保存的管理草稿；任何归属变化或额外改动先停止。
2. main 的 tracked/staged 均干净；未跟踪路径必须与上面清单精确一致。新增受控文件不得落入 temp，逐项检查新增路径碰撞；合并使用 `--no-overwrite-ignore` 保护个人忽略配置。
3. 合并先不提交，完整 test:changed 与 check 均通过后再记录实际结果并提交。遇到失败或冲突不可安全解决则按标准 merge --abort，保留 Task 分支与证据；不 reset、stash 或 force。
4. 不豁免任何代码/协议/安全/Git 授权 Invariant，不豁免测试断言、超时、检查强度或错误，不豁免 main:dev 推送前的干净工作区要求，不触及 origin/main、tag、发布或用户运行状态。

完成本地集成验证后登记 resolved；到期不续期，不作为其他任务的通用例外。

## 结果

冻结候选树 `3e067fa1a2d62e6ac9b9599c8481cd0837c8efc9` 的最终组合 test:changed 为 46/46 包通过，2077.1 秒；七个他人 temp 文件保留原位。合并前完整 check 于 2026-10-20 exit 0（39.8 秒，`open-forge-autonomy-integrated-final-check-20261020.log`）。已合并本地 main `80ad98655`；2026-10-20 登记 resolved，仅证明本地组合证据，不包含 dev push、origin/main、tag、发布、真实模型或真实 UI/监控验收。main:dev 推送仍必须满足原有干净工作区条件。
