---
id: TASK-0017
type: task
status: ready
priority: P1
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop]
write_paths: [packages/coding-agent, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0016]
conflicts_with: [TASK-0018, TASK-0019, TASK-0028]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---

# Work Agent Profile 基础（implementation-plan 阶段 3a）

## 目标

定义并装配 Work Agent Profile 的 Prompt、Memory 和 capability contributions，复用
已有 Runtime/Task/Artifact/Permission。Shell 与项目级 WorkspaceMode 由 TASK-0024
负责；本 Task 不重建 Mode Switcher，也不自行决定 WorkspaceMode、会话 `agentMode`
和 capability profile 的关系。

## 范围

### 并发评估

- 结论：不支持并发（Work Profile/Prompt/Memory 合同是后续 Work/Coding 任务的公共地基）
- 执行方式：serial
- 前置依赖：TASK-0016（Approval/Trust 合同）
- 冲突：TASK-0018/TASK-0019/TASK-0028（共享 Work/Coding Profile 合同先冻结）
- 集成负责人：coordinator

### 做

- Work Prompt、Memory 与产品能力贡献的装配合同；
- 为文档能力定义输入、`document` Artifact、Review/Export 所需的产品结果合同；端到端文件入口由 TASK-0028 实现；
- 若 ISSUE-0005 决定使用独立 capability profile，限定其 Owner、默认值与 Tool Policy 的关系，并同步更新 ADR。

### 不做

- 文档文件入口与导出 UI（TASK-0028）；
- 批处理/研究/数据分析入口（TASK-0018/TASK-0025/TASK-0026）；
- coding 侧增强（TASK-0019）；
- 云端执行。

## Given / When / Then

- Given：宿主按 ISSUE-0005 冻结的合同创建 Work Agent Session；
- When：Desktop Composition 绑定 Profile、Prompt、Memory 与 capability contributions；
- Then：Session 只编译该 Profile 声明的产品资源，Artifact/Tool/Permission 仍使用共享 Runtime 合同；文件到文档 Artifact 的用户流程由 TASK-0028 覆盖。

## 必须保持

- 两模式共享 Runtime/Task/Artifact/Permission 基础设施；
- WorkspaceMode、会话 `agentMode` 与 capability profile 不通过同一个字段隐式互相改写；
- work 与 coding 的能力边界只能按 ISSUE-0005 冻结的合同实现，Prompt 不是权限边界。

## 测试与验证

- 定向：Work Profile Composition 合同测试；文档入口用户流程由 TASK-0028 覆盖；
- 质量检查：`bun run check:quick`、desktop tsc。

## 阻塞

- ISSUE-0005 尚未决定 WorkspaceMode、会话 `agentMode` 与 capability profile 的关系；决议并同步 ADR 前，不实现按 mode 隔离 Tool Catalog。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
