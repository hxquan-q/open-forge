---
id: TASK-0008
type: task
status: done
priority: P1
owner: runtime-core/coding-agent/runtime-storage
requirement: REQ-0001
plan: PLAN-0001
execution: parallel
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-storage]
write_paths: [packages/runtime-core, packages/coding-agent, packages/runtime-storage]
exclusive_paths: []
depends_on: [TASK-0003, TASK-0004]
conflicts_with: []
integration_status: done
created: 2026-09-22
updated: 2026-09-22
---

# Task / Artifact / Approval 合同 Fixture

## 目标

把 Task、Artifact、Permission、Approval 的产品规划转成可验证的公共合同 fixture。

## 必须保持

- Task 复用已有 Session/Turn，不创建第二套模型循环；
- Artifact 文件内容仍是事实源，descriptor 是可重建投影；
- Approval 是 Runtime 状态，不是 Renderer 临时状态；
- `content` 与 `details` 不混用；
- generation 和 Snapshot 在 Turn 内不可变。

## 验收

覆盖状态转换、事件顺序、重启恢复、权限撤销、Artifact 缺失和 Review。

## 交付记录

- 新增 `@vetta/runtime-core/task`：产品无关合同类型（`RuntimeTaskSnapshot`/`RuntimeTaskEvent`/
  `ArtifactDescriptor`/`ToolRiskDescriptor`/`PermissionGrant`/`ApprovalRequest`）、
  可执行状态机（合法转换表 + `RuntimeTaskError` 稳定错误码）、事件重放恢复、
  grant 判定、artifact availability、持久化边界 `read*` 收窄。
- 新增 `@vetta/runtime-core/testing`：确定性场景 fixture（完成/审批/拒绝/返工/暂停取消/失败
  六条生命周期路径 + grant/artifact/approval 工厂）。
- 测试：`test/task/task-contracts.test.ts` 22 用例覆盖全部验收点；runtime-core 全包 478 通过；
  `check:quick` 与 `tsgo --noEmit` 干净。
- 边界说明：L0–L4 是否需要审批属 Policy 层决策，状态机只承载 `awaiting_approval` 进出；
  work/coding 语义、Artifact 渲染与 Trust 文件存储分别属于 coding-agent / Plugin SDK / 宿主，
  不在本合同内。
