---
id: TASK-0028
type: task
status: blocked
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024]
conflicts_with: [TASK-0018, TASK-0025, TASK-0026]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---

# Work 文档处理纵向切片

## 目标

交付首条可见 Work 流程：用户选择本地文档，Agent 按目标总结/改写/翻译/生成纪要，产出可预览、Review、导出的 `document` Artifact，并可从同一会话恢复。

## 范围

### 并发评估

- 结论：不支持并发（占用首个 Work Panel 文档区与 Artifact/Review 接线）。
- 执行方式：serial。
- 前置依赖：TASK-0015 Task/Artifact 投影、TASK-0016 写入授权、TASK-0017 Work Profile、TASK-0024 Workspace shell。
- 冲突路径：`apps/desktop/src/renderer/domains/workspace-mode`。
- 集成负责人：coordinator。

### 做

- 文档读取与输出路径由 Host 限定；生成计划和目标文件名供用户 Review；
- 生成内容先保存为新版本/暂存 Artifact，不静默覆盖来源文件；导出时检查目标与授权；
- Activity Panel 展示计划、生成状态、Artifact 预览、Review 与导出结果；取消/失败后保留原文和已生成版本；
- 文档 Task 由 TASK-0006 冻结的 promotion rule 创建，不从任意 Prompt 隐式推断权限。

### 不做

- 文件批处理、知识库研究和数据分析（分别由 TASK-0018、TASK-0025、TASK-0026 交付）；
- 云端上传、覆盖源文件的默认行为或不可逆批处理；
- 新建第二套 Conversation/Turn 执行循环。

## Given / When / Then

- Given：用户在 Work 文档入口选择一个本地文档并输入“总结成一页会议纪要”；
- When：Agent 生成内容，用户在 Artifact Preview 检查并批准导出位置；
- Then：源文档保持不变，产出有来源与版本的 document Artifact，Review 前不写到目标位置；重开会话后 Artifact/Review 状态可恢复。

## 必须保持

- 写入前受 TASK-0016 Tool Policy/Approval 约束，WorkspaceMode 本身不授予文件访问；
- Artifact 文件内容是事实源，descriptor/event 可重建且不覆盖历史版本；
- `content` 与 UI-only `details` 分离。

## 测试与验证

- 定向：来源读取边界、输出版本、拒绝导出、目标被占用、取消/失败恢复测试；
- 用户流程：选文档 → 生成 → 预览/修改目标 → Review → 导出 → 重开会话恢复；
- 质量检查：`bun run check:quick`、coding-agent/runtime-node/Desktop 影响测试。

## 阻塞

- ISSUE-0005 已裁决方案 C（done）；剩余唯一阻塞是 ISSUE-0006 的 Task 创建规则（draft）；其决议前不进入 `ready`。depends_on 已全部完成（2026-09-23 校准）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
