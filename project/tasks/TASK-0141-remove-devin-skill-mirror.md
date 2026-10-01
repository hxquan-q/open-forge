---
id: TASK-0141
type: task
status: ready
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0140]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 7f143c92d
read_paths: [AGENTS.md, CLAUDE.md, .agents/skills, .devin/skills, docs/dev, project, scripts/quality]
write_paths: [AGENTS.md, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing, .devin/skills/open-forge-task-intake, docs/dev, project, scripts/quality, package.json, .github/release-notes/v0.1.3.md]
exclusive_paths: [AGENTS.md, scripts/quality/check-guards.mjs, scripts/quality/workflow-skills.mjs]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 移除 Devin 开发 Skill 镜像

## 目标与范围

Open-Forge-only。按用户明确授权删除 Devin intake 镜像，移除 --write 与同步 API，保留 Claude 共享入口、平台占位提示、权威源和链接校验。
两项共享入口与检查，串行实施、分别提交；不建并行 Worktree，不动用户现有代码改动、不推送。

## Given / When / Then

- Given 根规则与执行入口，When 新会话读取，Then 安全/授权边界在短根文件内，详细规则有明确必读条件和有效引用。
- Given 用户授权镜像退出，When 检查当前开发入口，Then 权威源保持可用，不创建或重新注册 Devin 副本。

## 验证

先建立体积/引用或只读入口回归，再变更；保留受影响的语义与平台分支，删除同步功能时相应退役同步专属测试并补充“不产生副本”流程测试。机械检查不能证明真实模型的规则遵循。实际命令与结果完成后补记。
