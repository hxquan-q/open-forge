---
id: TASK-0038
type: task
status: draft
priority: P1
owner: packages/coding-agent + apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-4
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation]
write_paths: [packages/coding-agent/src/compaction, apps/desktop/src/renderer/domains/conversation, docs/adr, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034]
conflicts_with: [TASK-0035]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# compaction 与渲染端驻留联动 + 防抖三件套

## 目标

压缩参数面已齐（`contracts.ts:82-87`、`backpressure.ts:30-34`）但只省 token：渲染端 `chatMessagesAtom` 驻留与压缩完全解耦。本任务让 compaction 事件成为渲染端投影重建触发器（重放压缩后投影而非原全量），并补防抖三件套（回填检测、失败熔断、溢出尺寸种子），IM sidecar 无人值守长会话尤其需要。

## 范围

### 并发评估

- 结论：串行——投影重建依赖 TASK-0034 窗口化合同（压缩边界重放语义在其中定稿），且与 TASK-0035 共享 conversation 写路径；
- 上下文合同有变化，按仓库规则走 ADR 记录；
- 业界参照：Claude Code 压缩后清内部缓存（v2.1.50）+ thrash 回填检测（v2.1.89）+ 溢出种子（v2.1.142）；Codex `replace_compacted()` 同动作释放；opencode 压缩=剪枝旧工具输出。

### 做

- compaction 完成事件 → 渲染端以压缩后投影重建（压缩边界语义按 TASK-0034 合同）；
- 压缩后清理 Shiki/编辑器等派生缓存的钩子；
- 防抖三件套：连续压缩 thrash 检测、失败熔断、溢出尺寸种子；
- ADR 记录上下文合同变化。

### 不做

- 不改压缩触发参数（reserve 36k/空闲阈值 20%/保留最近 20k）；
- 不重放丢弃用户可见的已发消息——被剪部分以边界/摘要形态可定位。

## Given / When / Then

- Given：一次触发 compaction 的长会话
  When：压缩完成事件到达渲染端
  Then：渲染端驻留同步下降（重放压缩后投影），用户可见压缩边界而非原始全量；连续异常压缩被熔断而非死循环

## 必须保持

- 压缩不丢终态：压缩摘要与边界标记可还原会话脉络；
- 压缩进行中渲染端不闪断、不丢用户正在阅读的位置；
- JSONL 事实源不被压缩改写。

## 测试与验证

- 定向测试：thrash 注入（连续触发）熔断断言、边界重放投影正确性；
- 用户流程：长会话触发压缩→压缩前后 PerfMonitor renderer `privateBytes` 对比→继续会话；
- 质量检查：`check:quick`；ADR 评审。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
