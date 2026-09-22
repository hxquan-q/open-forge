---
id: TASK-0008
type: task
status: draft
priority: P1
owner: runtime-core/coding-agent/runtime-storage
requirement: REQ-0001
plan: PLAN-0001
created: 2026-09-22
updated: 2026-09-22
depends_on: [TASK-0003, TASK-0004]
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
