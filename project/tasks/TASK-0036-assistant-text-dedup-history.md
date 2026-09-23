---
id: TASK-0036
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-2
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation/services/chat-service.ts, apps/desktop/src/renderer/domains/conversation]
write_paths: [apps/desktop/src/renderer/domains/conversation, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0029, TASK-0035]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# assistant 文本双份存储消除（历史回放路径先行）

## 目标

`chat-service.ts:740-742,526-529` 在历史回放中 blocks push 后又 `target.text = target.text + text` 同段全文再拼一份；`chat-service.ts:977` 流式 `appendTextDelta` 同型双写。历史回放路径让 `text` 成为派生值（惰性 join/selectAtom），不再预拼；live 流式增量拼接保留。

## 范围

### 并发评估

- 结论：条件支持——改动集中在 `chat-service.ts` 及消费方，与 TASK-0029/0035 共享 conversation 目录，串行执行；
- 业界参照：pi 内存镜像只存一份文本（`session-manager.ts:994-998`）；Codex `Arc` COW 只读共享（`context_manager/history.rs:73-75`）。

### 做

- 全量消费方盘点（导出、复制、搜索、匀速流出器、媒体投影），确定 `text` 读取点；
- 历史回放路径去除双写，`text` 改派生；
- `text === join(blocks)` 一致性单测。

### 不做

- 不改 live 流式 `appendTextDelta` 的增量拼接语义；
- 不改消息块公共形状（blocks 结构、协议字段不变）。

## Given / When / Then

- Given：用户打开含大段 assistant 文本的历史会话
  When：历史回放到消息列表
  Then：内存中 assistant 文本只驻留一份（blocks），`text` 按需派生；导出/复制/搜索输出与改造前逐字一致

## 必须保持

- 所有消费方读到的 `text` 与 blocks join 逐字一致；
- 流式路径渲染不变；
- TASK-0031 媒体投影（`src`/回退 `data:`）不受影响。

## 测试与验证

- 定向测试：`text` 派生一致性、消费方（导出/复制/搜索）回归；
- 用户流程：打开长文本会话→复制/导出→与基线输出 diff；
- 质量检查：`check:quick`；预期纯文本会话 assistant 驻留约省一半（RESEARCH-0004 估算 5MB 文本会话省 2–3MB）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
