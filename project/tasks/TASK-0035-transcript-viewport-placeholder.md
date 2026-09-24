---
id: TASK-0035
type: task
status: draft
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-1 第 1 步 / TASK-0034 合同
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034]
conflicts_with: [TASK-0029]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# transcript 窗口化第 1 步：视口外消息元数据占位

## 目标

`chatMessagesAtom`（`chat-atoms.ts:186`）当前驻留当前会话全部消息对象；react-virtuoso 只虚拟化 DOM、不裁 JS 对象。按 TASK-0034 合同把视口外消息降级为元数据占位（id/role/时间/摘要级），blocks 全量只在视口 ±N 内驻留，滚动进视口时按需还原。

## 范围

### 并发评估

- 结论：条件支持——与在途 TASK-0029 共享 `shared/store` + `domains/conversation` 写路径，须待其集成后串行；
- 前置依赖：TASK-0034 合同（占位结构、还原触发点、消费方归并方案）；
- 冲突文件：`chat-atoms.ts`、`MessageListView.tsx`、`conversation-projection.ts` 一带。

### 做

- 按合同实现占位数据结构与视口窗口管理；
- 依赖全量数组的消费方（导出/复制/搜索/统计）改走分页归并或全量读路径；
- `preserveMessagesAddedAfterSnapshot` 乐观 reconcile 适配窗口边界；
- PerfMonitor 可观测：占位模式下 renderer `privateBytes` 随会话长度趋平。

### 不做

- 不实现向上游标分页（本步占位之外的更早历史仍按合同既有方式获取，游标分页属下一步）；
- 不改持久化格式与 JSONL；
- 不动 live 流式路径语义。

## Given / When / Then

- Given：用户打开一个含数百条消息的长会话
  When：滚动浏览全会话
  Then：视口内渲染与现状一致，视口外为占位；renderer `privateBytes` 稳态随会话长度从 O(全量) 降为 O(窗口)；导出/搜索/统计结果不变

## 必须保持

- 已发消息可见性：占位可展开还原，无消息丢失；
- 会话切换后旧会话驻留可释放；
- 媒体引用（TASK-0031 的 `src`/回退 `data:` 双形态）在占位/还原两种状态下行为不变。

## 测试与验证

- 定向测试：占位/还原纯函数用例、窗口边界 reconcile、消费方归并正确性；
- 用户流程：长会话打开→滚顶→滚底→导出→切会话往返；
- 质量检查：`check:quick`；PerfMonitor 快照对比长会话 privateBytes 峰值/稳态。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
