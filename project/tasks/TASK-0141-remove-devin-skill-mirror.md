---
id: TASK-0141
type: task
status: done
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
base_commit: f5f406140
read_paths: [AGENTS.md, CLAUDE.md, .agents/skills, .devin/skills, docs/dev, project, scripts/quality]
write_paths: [AGENTS.md, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing, .devin/skills/open-forge-task-intake, docs/dev, project, scripts/quality, package.json, .github/release-notes/v0.1.3.md]
exclusive_paths: [AGENTS.md, scripts/quality/check-guards.mjs, scripts/quality/workflow-skills.mjs]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
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

## 迁移边界

- 删除前确认绝对目标在本工作区、不是链接、仅含 4 个已知文件，且内容逐个等于权威源；只删除该镜像目录，保留其他配置和空父目录。
- 权威源与 Claude 共享入口不变；移除 syncWorkflowSkills 和 --write。只读检查发现旧名或重新出现的 Devin 副本时报告错误，不自动清理。
- 退役了同步创建/漂移修复/多宿主复制专属用例，改为无副本读取、旧 --write 拒绝且无副作用、重新引入副本拒绝与现有平台/链接/元数据回归。不是为了通过而跳过仍存在的功能。
- 新合同在旧实现上 17 例中 7 失败、10 通过；迁移后 17 例通过。

## 实测

- 只读工作流 17 例通过；test:impact 运行质量套件 35 文件 / 463 例通过。
- 针对删除的 4 个镜像 Markdown 运行 test:changed，选择器确认没有受影响的可测试包；只读 CLI 及守卫的行为验证由上述质量套件承担，不宣称因此运行了全工作区测试。
- 根文件体积/规则引用、Skill 出入向链接、两个 Skill 格式与 frontmatter 扫描通过；53 个 SKILL.md 合法。
- 不再执行 --write；测试验证旧参数明确失败且不创建镜像。未运行真实模型/宿主会话/UI/远端 CI，没有推送。
- 完整 `bun run check` 退出码 0；随后只修正文档中的旧“镜像检查”用语并重跑只读引用/体积/Task 检查。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
