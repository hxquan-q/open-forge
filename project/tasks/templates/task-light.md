---
id: TASK-xxxx
type: task
status: draft
priority: P2
owner:
requirement:
source: user-request
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths: []
write_paths: []
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
<!-- Copyright The Open Forge contributors. -->

# 轻量任务标题

适用：范围明确、串行、可独立验证回滚的维护；元数据照常填写，正文用下列短合同。并行、迁移或复杂行为改用 [完整模板](task.md)。

## 合同

- 来源与目标：复用 REQ/BUG/ISSUE；本次要完成的结果。
- 输入 → 输出：目标文件/现有行为 → 期望产物；依赖见 frontmatter。
- 做 / 不做：明确范围；并发结论为串行，共享写域或无拆分收益，无需独立 Worktree。
- Given / When / Then：已有条件 / 本次动作 / 可观察的完成标准。
- 保留：本次涉及的边界与兼容合同；失败/取消/恢复仅在相关时写。
- 验证：实际命令、检查对象与通过标准；无行为变化无需新增运行时测试。
- 人工验收：适用时写入口和预期结果；内部维护不适用时说明工程完成标准。

## 交付

- 实际修改与验证：命令/结果；无变化的已有证据可引用。
- 评审与集成：自审/独立审查及发现；集成状态与 frontmatter 一致。
- 未运行与风险：如实说明；不把静态检查记为模型效果通过。
- 发布：实际授权与状态；发布说明条目或不适用依据。
