---
id: TASK-0465
type: task
status: done
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0463, TASK-0464]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 553d0da18
read_paths:
  - apps/desktop/src/main/ipc/session.ts
  - packages/host-protocol/src/stream.ts
write_paths:
  - project/tasks/TASK-0465-session-stream-migration-investigation.md
  - project/tasks/README.md
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
exclusive_paths: []
depends_on: [TASK-0464]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 会话流领域 Host 迁移：调查与切片规划（Phase 3 第 2 批入口）

## 调查结论（2026-11-07，只读核对 `ipc/session.ts` 全 84 通道）

按形态分组（通道数为 grep 实测）：

1. **纯请求/响应（无事件、无凭证、无审批面）**——可先行迁入合同：
   - 会话元数据/模式：rename、retry、update-settings、set-personalization、set-global-{agent,execution}-mode、set-global-thinking-level、set-execution-mode、plan-mode-{get-state,set-permission-mode}、next-prompt-suggestions、switch-branch 等（约 14）。
   - 队列操作：queue-{resume,remove,reorder,send-now,clear,context-compaction}（6；`queue-state` 是事件，见 3）。
2. **带主→renderer 事件推送**——需事件订阅原语后再迁：sessions-changed、running-changed、pending-question-changed、question-request、plan-review-request、sandbox-grant-request、queue-state、viewer-event（8）。合同已有 `reduceHostStream`（快照+增量，ADR-0152 §6），缺的是 Host 方法层的 `subscribe` 形状与 MessagePort 上的事件帧（可复用 port-bridge 帧格式扩展 `{id, event}` 帧）。
3. **审批/权限面（ADR-0152 §7 同级谨慎）**：sandbox-grants-*（5，授权与撤销——审批状态属 Host 一方化范围，迁移前需单独评审）；question-*/plan-review-* 的 request/response 交互与事件耦合，随事件原语一起设计。
4. **viewer 流（viewer-open/subscribe/unsubscribe/event）**：独立子域，流语义最重，放最后。

## 切片规划（定稿）

- **TASK-0466（下一切片，建议）**：会话"元数据/模式"纯请求子域（组 1 前半，约 10–14 通道）迁入 `session` Host 域——沿用 models 域模式（TypeBox 合同、desktop-host 注册、preload 切换、删旧 handler、IPC 计数下降）。
- **其后续**：事件订阅原语（`session.subscribe` + port 帧扩展 + `reduceHostStream` 接线），随后队列与问答/评审子域；sandbox-grants 单独 §7 评审；viewer 最后。
- 每切片维持既有门禁链（desktop 定向 + typecheck 双侧 + 根 tsgo + check:quick + test:impact + quality 核实）。

## 不做

- 本任务不含代码改动（调查与规划）；不迁移审批面与事件通道。

## 交付记录

- 实际产出（2026-11-07）：84 通道全量分组盘点（如上）、切片顺序定稿、事件原语缺口识别（subscribe 形状 + port 事件帧）；本记录即交付物，无代码变更。
- 后续切片以 TASK-0466+ 立项。
