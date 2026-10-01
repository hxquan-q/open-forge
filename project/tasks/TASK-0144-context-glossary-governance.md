---
id: TASK-0144
type: task
status: ready
priority: P2
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0140, TASK-0142]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: dc49dc54d96a6d3ba3e77047b2b37fca6bab9600
read_paths: [CLAUDE.md, CONTEXT.md, AGENTS.md, docs/dev, project, scripts/quality]
write_paths: [CLAUDE.md, CONTEXT.md, docs/dev, docs/glossary, project, scripts/quality, package.json, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/quality/check-agent-guide.mjs, scripts/quality/check-guards.mjs, project/tasks/README.md]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 领域术语分册与根检索入口

## 目标与范围

Open-Forge-only。继续治理根目录大文档，两个关注点串行、分开提交；保留已有授权、术语和用户代码改动，不推送。

- CLAUDE：重复架构/命令/发布政策回指现有权威，独有提交纪律与报告格式下沉，根保留发现入口与即时边界。
- CONTEXT：以分册降低按需读取成本，原词条正文不作事实或产品语义改写；根保留所有词条标题与导航，保留旧锚点。
- 不做：修改运行时、确认所有旧术语仍符合当前代码、重构产品领域、读取用户状态或自动运行真实模型。

## 验证合同

- Given 新入口，When 按任务读取，Then 能定位适用规则或词条正文，不需默认加载全部内容。
- Given 文件超限、导航丢失或重复词条，When 对应守卫运行，Then 报错，不降低门禁。
- 对旧文档做分段保留核对；新增检查先写失败用例，使用质量套件和完整 check；静态检查不冒充模型行为验证。
