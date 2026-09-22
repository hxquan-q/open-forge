---
id: TASK-0016
type: task
status: draft
priority: P1
owner: runtime-core/coding-agent/runtime-node/apps-desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [packages/runtime-core/src/task]
depends_on: [TASK-0015]
conflicts_with: [TASK-0015]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# Permission/Approval：L0-L4 风险分级与 Project Trust（implementation-plan 阶段 2）

## 目标

在已冻结的 `ToolRiskDescriptor`/`PermissionGrant`/`ApprovalRequest` 合同上实现：
Tool 风险描述符注册、L0-L4 评估、Session Trust 与 Project Trust 本机文件、
Approval Request/Decision 事件流、Task/Artifact Review 投影，
以及取消、过期、撤销、关闭窗口后的状态恢复。

## 范围

### 并发评估

- 结论：不支持并发（改同一 Task 事件面与权限判定入口）
- 执行方式：serial
- 前置依赖：TASK-0015（Approval 事件挂在 Task observation 上）
- 集成负责人：coordinator

### 做

- L0-L4 风险分级映射到现有权限模式/审批 broker；
- Project Trust 本机文件（可撤销、可过期、scope 隔离）；
- Approval Request/Decision 进事件日志，进程重启后 pending 状态可恢复；
- Review 投影：Task 计划审、Artifact 终审三分支（approved/changes_requested/rejected）。

### 不做

- 组织策略/云端审计（MVP 排除）；
- 外部副作用的自动回滚承诺；
- 非幂等错误的自动重试。

## Given / When / Then

- Given：coding 模式下一个 Task 需要执行 Shell/网络写入类工具；
- When：工具调用触发 L3 风险，用户批准/拒绝/关闭窗口后直接退出进程再重启；
- Then：低风险自动放行、高风险阻塞等待、L4 始终需确认；重启后 pending approval 原样恢复；撤销 Trust 后同 scope 立即回落到逐次审批。

## 必须保持

- Tool Policy 在模型请求前和工具执行前都生效；
- 项目策略只能收紧不能放宽；
- Trust scope 隔离；撤销立即生效；
- Approval 是 Runtime 状态而非 Renderer 临时状态。

## 测试与验证

- 定向：grant 判定/过期/撤销单元测试（fixture 已在 `@vetta/runtime-core/testing`）、Approval 事件重放恢复测试；
- 用户流程：高风险工具 → 弹审批 → 重启恢复；
- 质量检查：`bun run check:quick`、runtime-core/coding-agent 全包。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
