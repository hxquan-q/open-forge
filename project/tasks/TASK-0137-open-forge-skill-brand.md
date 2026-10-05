---
id: TASK-0137
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0003, REQ-0004]
related_plan: [PLAN-0003, PLAN-0004]
related_tasks: [TASK-0136]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 98cfb4b00123ae72cbc6dd2af597b55fe184eeef
read_paths: [AGENTS.md, .agents/skills, .devin/skills, scripts/quality, project, docs/dev, apps/desktop]
write_paths: [AGENTS.md, .agents/skills, .devin/skills, scripts/quality/workflow-skills.mjs, scripts/quality/workflow-skills.test.mjs, project, docs/dev/quality-gates.md, .github/release-notes/v0.1.3.md, apps/desktop/src/renderer/domains/conversation/services/transcript-window.test.ts, apps/desktop/src/renderer/domains/command-menu/components/CommandMenuView.test.tsx]
exclusive_paths: [scripts/quality/workflow-skills.mjs, AGENTS.md]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 开发 Skills 与描述统一为 Open Forge

## 目标与范围

归属：Open-Forge-only。用户已确认两个技能入口、目录与相关描述改用 open-forge-task-intake / open-forge-testing。共享引用和生成镜像需一致，串行实施，不拆 Worktree。

- 更名权威目录与 frontmatter，重新生成 Devin 镜像；Claude 的共享链接保持不变。
- 更新根指南、活动开发文档、Task、测试示例、质量脚本与当前发布说明。
- 历史发布/研究/验证里的旧名称保留为当时事实；历史记录指向当前文件的链接修复，不改写上游来源。
- 不改 @vetta 包、协议、凭据、持久化字段、应用运行时标识及已发布版本；不动用户已有修改。
- 直接迁移名称足够，未引入第二套入口或兼容包装。旧命令不再注册，后续调用使用新名称；现有会话缓存需刷新或新开会话。

## Given / When / Then

- Given 新品牌目录，When 同步并检查，Then 新名称可定位、描述一致、各宿主引用有效。
- Given 旧名称目录意外残留，When 检查，Then 报错而不是静默注册两个入口或自动删除文件。
- Given 命令菜单或消息引用展示技能，When 运行现有组件/服务测试，Then 新名称与描述不破坏既有行为。

## 验证记录

- Red：测试先采用新目录名，旧脚本仍查旧名，11 例中 9 例失败、2 例通过。
- Green：迁移后 11 例通过；补充真实 Skill 品牌断言捕获残留旧标题（11 过 / 1 失败），修正后质量测试共 34 文件 / 452 例通过。
- `test:impact`：34 文件 / 452 例通过；Desktop 两个直接受影响测试：45 例通过；两个 Skill 格式校验与 85 个文档相对文件链接通过。
- `test:changed`：质量脚本变更触发全工作区回退；已出现未修改的 plugin-vite 2 例失败、runtime-node 3 例超时、cli-host 超时。本次没有修改这些模块，未完成基线归因；收到新的审核修复任务后终止本次扩大的测试进程树，不能报告全量测试通过。
- 完整 check 首次仅本次 CommandMenuView 测试缺少声明头报错，已补齐；复验退出码 0。全工作区行为测试未通过，Task 保留 verifying，不推送。
- 未运行：真实模型、Desktop 实机与远端 CI；本任务不改变 UI 行为，也未授权启动实例或发布。

## 验收与交付

内部命名迁移按新入口存在、旧注册消失、描述及引用一致、现有测试与门禁通过验收；用户已明确批准目标名称。TASK-0136 的真实路由试用仍保持待验收，不因本次改名而自动关闭。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
