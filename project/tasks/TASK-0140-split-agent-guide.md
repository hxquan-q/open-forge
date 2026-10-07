---
id: TASK-0140
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0139]
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
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 根规则按职责拆分与常驻预算

## 目标与范围

Open-Forge-only。根 AGENTS、规则扩展、入口引用与体积/链接守卫；保留所有既有硬边界和测试标准，不导入参考文件的冲突规则。
两项共享入口与检查，串行实施、分别提交；不建并行 Worktree，不动用户现有代码改动、不推送。

## Given / When / Then

- Given 根规则与执行入口，When 新会话读取，Then 安全/授权边界在短根文件内，详细规则有明确必读条件和有效引用。
- Given 根文件超过 8 KiB 或扩展引用损坏，When 运行门禁，Then 明确失败，不通过放宽预算或跳过检查解决。

## 验证

先建立体积/引用或只读入口回归，再变更；保留受影响的语义与平台分支，删除同步功能时相应退役同步专属测试并补充“不产生副本”流程测试。机械检查不能证明真实模型的规则遵循。实际命令与结果完成后补记。

## 规则迁移映射

- 项目概览, 指令作用域, 常见任务入口 → `docs/dev/agent-rules/repository.md`。
- 开始任务, 架构与 ADR, 实施原则, TypeScript 与 UI → `docs/dev/agent-rules/engineering.md`。
- 测试与验证 → `docs/dev/agent-rules/testing.md`。
- 发布说明与新增包, 交付要求 → `docs/dev/agent-rules/delivery.md`。
- 上游同步与改动归属, Git 与并行工作区 → `docs/dev/agent-rules/collaboration.md`。
- 规则分级与豁免, 维护本文件 → `docs/dev/agent-rules/governance.md`。
- AI 与安全边界原文完整保留根文件；Git/类型/依赖硬条款根文件前置，细节在对应扩展，不降级。

## 参考取舍

- 用户提供 `C:\Users\xquan\Downloads\AGENTS\agents (2).md`（SHA-256 `368f837649b8eaa9e709a9e335c45286dabb1f7448b8b72009cfcb4ba5f69847`），仅作参考，不复制为新指令。
- 用户提供 `C:\Users\xquan\Downloads\AGENTS\AGENTS.md`（SHA-256 `cbd18f3411a5ff444ef514be67eb0b543ea1a693dab204d40793d10e28053475`），仅作参考，不复制为新指令。
- 采用硬边界前置、稳定原则与机制分离、有限反馈与充分验证；不采用全局禁删/禁重构、每步询问、常驻大状态机，也不以“质量残余”降低本仓必需门禁。

## 实测

- 根文件由 31,080 字节降至 7,911 字节；6 份扩展按触发条件加载。
- 对 7f143c92d 的全部 15 个二级规则段逐段核对：AI 安全原文仍在根；其他段落除链接重定位外完整保留在扩展中。
- 新守卫在旧根上复现超限/缺少扩展引用失败；迁移后 6 例通过，test:impact 选择质量套件 35 文件 / 466 例通过。
- 参考文件只采用结构原则，未引入其中与既有授权/重构/测试冲突的指令；无真实模型路由、UI 或发布验证。
- 完整 `bun run check` 退出码 0；保留既有基线回退及用户文件 CRLF 提示，未改动无关文件或降低门禁。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
