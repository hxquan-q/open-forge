---
id: TASK-0025
type: task
status: blocked
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-knowledge, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024, TASK-0028]
conflicts_with: [TASK-0018, TASK-0026]
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# Work 本地研究与来源整理

## 目标

在既有 Knowledge Runtime 上交付一个端到端本地研究流程：检索用户选定的项目资料、回答问题、附上可追溯来源，并把经过 Review 的证据整理为 `research-evidence` Artifact。

## 范围

### 并发评估

- 结论：条件支持；必须先冻结 TASK-0017 Work Profile 与 TASK-0028 Activity/Artifact 面板合同。
- 执行方式：serial（默认）；仅在 Skill/Runtime-knowledge/Activity UI 写路径独立后再拆 Worktree。
- 前置依赖：TASK-0015、TASK-0016、TASK-0017、TASK-0024、TASK-0028。
- 集成负责人：coordinator。

### 做

- 使用显式注入的本地 Knowledge root；列出检索范围、来源 URI、摘要及引用关系；
- 以 `research-evidence` descriptor 和引用清单产出可 Review 的结果；
- 缺失/已变更来源给出可恢复状态，取消和部分失败不丢弃已完成的来源记录。

### 不做

- 默认联网搜索或上传本地资料；
- 为 Work 单独创建 Session/Runtime/Knowledge Store；
- 未经用户确认向源文件写入改动。

## Given / When / Then

- Given：用户在 Work 研究入口选择一个本地资料集并提出研究问题；
- When：Agent 检索本地来源并生成带引用的摘要，用户检查来源后提交 Review；
- Then：每条结论都能回到明确来源，缺失来源会标出而不会编造，审核后的引用整理保存为 Artifact 并能在重开会话后查看。

## 必须保持

- Knowledge Runtime 拥有索引/页面存储规则，Coding Agent 只拥有 Tool/Prompt/投影策略；
- 不访问默认 home 根，宿主显式注入路径；
- `details`/UI payload 不进入模型可见 `content`。

## 测试与验证

- 定向：检索命中/空结果/失效来源合同测试、Artifact 来源关联与重放测试；
- 用户流程：选择本地资料 → 提问 → 查看带引用结果 → Review → 重开会话验证引用；
- 质量检查：`bun run check:quick`、runtime-knowledge/coding-agent 影响测试和 Desktop 组件测试。

## 阻塞

- ISSUE-0005 与 TASK-0017 的 Work Profile 合同未决；本 Task 不通过 WorkspaceMode 自动放宽网络或文件写权限。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
