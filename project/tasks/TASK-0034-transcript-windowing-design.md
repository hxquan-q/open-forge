---
id: TASK-0034
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-1
execution: coordination-only
branch: forge/dev
worktree: unassigned（设计定稿，不创建代码 worktree）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/main/ipc/session.ts]
write_paths: [project/tasks]
exclusive_paths: []
depends_on: [TASK-0031]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# 渲染端 transcript 窗口化合同定稿

## 目标

RESEARCH-0004 P1-1 三步走（视口外元数据占位 → `beforeEntry` 游标向上分页 → compaction 边界重放）是剩余路线图里单项天花板最高、回归面也最大的一项。落地前先定稿窗口化合同，产出可独立回滚的实现 Task 拆分与各自的 Given/When/Then。

## 范围

### 并发评估

- 结论：coordination-only（设计协调，不写代码）
- 前置依赖：TASK-0031（媒体引用化，done）——占位语义需在其 `src`/回退 `data:` 双形态之上定义
- 集成负责人：主会话

### 做

- 定稿 `openViewer`/`getFullHistory` 的游标分页合同：`beforeEntry` 参数形状、页大小、空页/到头语义、与现有 `tailTurns` 的关系；
- 定义视口外消息占位数据结构（保留 id/role/时间/摘要级字段，不驻留 blocks 全量）及展开触发点；
- 盘点依赖全量消息数组的消费方并定改造归属：导出、复制、搜索、统计、`preserveMessagesAddedAfterSnapshot` 乐观 reconcile；
- 明确 compaction 边界重放与 TASK-0038 的边界（重放语义归本合同，压缩联动/防抖归 0038）；
- 拆分后续实现 Task（预计 step1 占位、step2 游标分页、step3 边界重放各自独立登记），回填交付记录。

### 不做

- 不改 renderer/IPC/存储代码；
- 不引入 SQLite/ordinal 二级索引（RESEARCH-0004 P2-1，触发信号未达）；
- 不重写渲染管线。

## Given / When / Then

- Given：合同评审通过
  When：按合同登记实现 Task
  Then：每个 Task 范围可独立回滚、不变量与测试层级明确、全量数组消费方无一遗漏归属

## 必须保持

- 会话恢复与持久化正确性不变；JSONL 仍为唯一事实源；
- 已发消息可见性不回退（占位必须可展开还原）；
- `ipc/session.ts` 现有 `openViewer`/`tailTurns` 调用方兼容。

## 测试与验证

- 定向测试：无（设计任务）；
- 验收：拆分出的实现 Task 通过评审登记，且每个都引用本合同。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
