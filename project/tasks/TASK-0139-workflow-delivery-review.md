---
id: TASK-0139
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-review
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0136, TASK-0138]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 73a365f0c
read_paths: [AGENTS.md, .agents/skills, project, docs/dev]
write_paths: [AGENTS.md, .agents/skills/open-forge-task-intake, .agents/skills/open-forge-testing, .devin/skills/open-forge-task-intake, project, .github/release-notes/v0.1.3.md]
exclusive_paths: [AGENTS.md, project/tasks/TASK-0136-unified-development-entry.md]
depends_on: [TASK-0138]
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 交付判据与规则单一事实源

## 范围与选择

Open-Forge-only。审核 #2/#3/#4/#5/#8 与小问题的文档修正；串行，与已完成的守卫修复分开提交。

- intake 补回允许实施、工程完成及当前版本发布说明步骤。
- 完整职责/验收语义归 delivery.md，其他位置只留入口或本文件独有的状态/执行语义。
- 根 AGENTS 新增长段压成短指针，保留既有 Invariant；文件仍超过部分宿主预算，整体重排另行规划，入口要求遇到截断时读取完整文件。
- TASK-0136 已在 main 提交，记录 integrated 并绑定 98cfb4b00；条件通过不等于人工接受，继续 verifying。
- 不重写 98cfb4b00 历史，承认其混合关注点，后续以 73a365f0c 与本 Task 分开修正。

## Given / When / Then

- Given 当前入口，When 准备实施或交付，Then 有明确判据和发布说明入口，不依赖长根规则的尾部。
- Given 仅完成本地集成，When 更新 Task，Then integrated 与 verifying 可并存，不能写成 pending 或假称用户接受。
- Given 缺少本机工程控制论 Skill，When 执行复杂任务，Then 可选依赖有完整名称与回退，不阻塞或自动安装。

## 验证与交付

核对引用、镜像、Skill 元数据、Project 状态与实际提交；使用现有 20 个守卫回归及质量套件，文案/合同编辑不增加运行时单元测试。文档场景是作者审查，不是模型行为评测。实际结果见下方记录。

## 已完成核对

- 入口直接包含“允许实施”“工程完成”与当前版本发布说明入口；无需读取根规则尾部才知道交付条件。
- 分工与验收政策集中于 delivery.md；CONVENTIONS、开发流程和导航只留指针，需求仍保留可验收结果，不把需求文件当操作手册。
- 根规则只压缩本轮新增/重复导航，没有删减安全或 Git 不变量；仍不承诺整份文件低于 16 KiB，宿主截断问题需后续整体重排。
- REQ-0004 索引标题已与正文一致；测试 Skill 恢复无运行时变更编辑的排除说明，工程控制论 Skill 写明全名、可选性与不可用时回退。
- 旧提交不改写；保留 Devin 镜像的兼容决策见 TASK-0138。真实新会话模型路由未执行，不将静态检查报告为行为验收。

- 根 AGENTS 实测由本轮修正前 32,005 字节降至 31,080 字节；也低于 TASK-0136 前的 31,111 字节。完整重排不在本补丁内。
- 本轮复验：质量套件 34 文件 / 460 例通过；两个 Skill 格式、镜像/入向出向链接、Project/Task 状态及发布说明检查通过。
- 同批最终 `bun run check` 退出码 0；未运行真实模型路由、UI 实机和远端 CI，未推送。文档结果记录后重新核对镜像、链接、索引与 Task 合同。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
