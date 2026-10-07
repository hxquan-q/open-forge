---
id: TASK-0138
type: task
status: done
priority: P1
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-review
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0136, TASK-0137]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 24acb39ea
read_paths: [scripts/quality, .agents/skills, .devin/skills, .claude/skills, project, docs/dev]
write_paths: [scripts/quality, docs/dev/quality-gates.md, project/tasks, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/quality/workflow-skills.mjs]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 工作流守卫的平台与覆盖修正

## 范围与选择

Open-Forge-only。落实审核 #1/#7 和 Markdown 链接误报问题；串行，不改 Git 历史，不删除 Devin 兼容镜像，政策文案另行提交。

Claude 共享入口与 Devin 生成镜像分开：真实链接必须指向权威目录；正确 Git 占位文件允许按权威源完成工程检查，但明确告知 Claude 路径未就绪，用户须开启符号链接支持后安全重新检出。错误占位内容/错误链接失败，--write 不改 Git 配置或占位文件，也不在普通文件下建目录。

## Given / When / Then

- Given 未启用 symlinks 的 Git 检出，When check/--write，Then 不报 Missing mirror/ENOTDIR，保留占位内容并给出可操作提示，仍验证权威源与 Devin 镜像。
- Given Claude 链到错误目录，When check/--write，Then 拒绝而不误同步。
- Given 开发规则中指向 Skill 的链接损坏，When check，Then 报错；代码块/行内代码中的链接示例不参与，合法 title 不误报。
- Given .agents 或 .devin 下 frontmatter 不合法，When 全量扫描，Then 可发现，不依赖 staged 模式。

## 验证与交付

先添加失败测试，再修正；保留现有目录越界/旧名残留/同步测试。使用定向与 test:impact，不再次触发已知扩大全工作区失败的 test:changed；完整 check 在本批代码完成时执行。静态覆盖不等于模型路由评测。实际结果待补。

## 实测记录

- Red：新增的占位文件、错误 Claude 目录、入向链接、title/代码示例用例在旧实现上 4 失败 / 12 通过，包含 ENOTDIR 原始复现。
- Green：专项 19 例通过；test:impact 选择质量套件，34 文件 / 459 例通过；frontmatter 全量扫描由 39 扩为 54 个文件，全部通过。
- 新增 CLI 级占位文件验证，不仅调用内部函数；同步后占位内容保持不变，输出 core.symlinks 与 Claude 未就绪提示。
- 只验证支持的 Markdown 内联链接语法与文件存在性，不宣称完整 CommonMark/标题锚点检查或真实模型评测。
- 保留 Devin 镜像作为未确认退役的兼容消费者；只有用户确认相关环境均不需要后再删除。不改写先前提交历史。
- 完整 `bun run check` 退出码 0；既有 upstream/dev 回退和用户文件 CRLF 提示保留，未放宽基线或改动无关文件。
- 后续自审增加父目录重定向到工作区外的占位文件用例：旧实现 19 过 / 1 失败，读取前增加解析路径边界检查后 20 例通过；质量套件复跑 34 文件 / 460 例通过。该补充仍独立于文档政策提交。
- 后续决策：用户明确授权移除 Devin 镜像，TASK-0141 退役副本、同步 API 和 --write；上文保留镜像的决策仅描述审核时状态，不再指导当前使用。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
