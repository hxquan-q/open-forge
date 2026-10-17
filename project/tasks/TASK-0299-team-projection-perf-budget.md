---
id: TASK-0299
type: task
status: done
priority: P3
owner: desktop
requirement:
plan:
source: BUG-0127
related_requirement: []
related_plan: [PLAN-0002]
related_tasks: [TASK-0291, TASK-0292, TASK-0293]
related_issues: []
related_bugs: [BUG-0127]
execution: serial
branch: main
worktree:
base_commit: 756aa231e
read_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.ts
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.test.ts
  - apps/desktop/src/renderer/domains/activity-panel/services/canvas-data-grid.test.ts
write_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.perf-budget.test.ts
exclusive_paths:
  - apps/desktop/src/renderer/domains/conversation/connectors/team/teamChatModel.perf-budget.test.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# 团队时间线投影性能预算护栏（BUG-0127 修复的回归防线）

## 目标

BUG-0127 路线 5 三片（索引化 / 持久基座 / 聚合守卫）目前只有行为基线——他人重构回 O(n²) 不会被现有测试抓住。按仓库既有先例（canvas-data-grid「可复现预算」测试：守数量级回归而非绝对速度，预算取线性实测的宽裕倍数、与二次爆炸保持 ≥5× 分离）为 `projectTeamConversationTimeline` 补一条合成大规模输入的性能预算测试。

合成规模（对齐缺陷报告量级并放大到可分辨）：协调会话 5000 条消息（其中 agent 项带 200 字符文本，触发文本兜底路径）、1000 条委派活动、5 名成员、2 条活跃流——旧实现的Activity 循环 A×C 谓词 ≈ 500 万次 + 文本兜底全量比较，数量级在数百毫秒；索引化后为 O(A+C+S)。

## 范围

### 并发评估

- 结论：不支持并行；serial；单测试文件切片。

### 做

- 新增 `teamChatModel.perf-budget.test.ts`：合成 fixture + 计时断言（预算从本机实测取 ~10× 宽裕，注释说明守的是数量级）+ console.log 实测值（先例格式）。
- 断言输出正确性（条目数非零）防止“空跑变快”假绿。

### 不做

- 不测 React hook 层（memo 复用是渲染层，计时抖动大；行为已有 32 例覆盖）。
- 不守 TASK-0293 的死计算消除（常数因子差异，计时不可分辨——行为等价已证）。

## Given / When / Then

- Given：5000 消息 + 1000 活动的合成快照，When：projectTeamConversationTimeline（聚合视图），Then：在预算内完成且输出条目数正确；若退化回 O(n²)（数百毫秒量级）则超预算红。

## 必须保持

- 现有投影行为零改动（纯新增测试）。
- 预算宽裕到 CI 抖动安全（先例口径：与目标值 ~3×、与回归值 ≥5× 分离）。

## 测试与验证

- 定向：新测试 + team 连接器套件；完整 `bun run check`。

## 验收分层

- 工程验证：待执行；技术评审：自审（数量级分离论证）；集成：pending；人工验收：不适用（纯测试）；发布：未授权（测试不进发布说明，依据记入交付记录）。

## 功能验收包

- 不适用（无行为变化）。

## 交付记录

- 实际修改：新增 `teamChatModel.perf-budget.test.ts`——①5000 消息 × 1000 活动的聚合投影预算测试（本机实测 ~24ms，预算 150ms ≈ 6× 宽裕；O(n²) 退化在数百毫秒量级变红，注释说明守数量级）；②带基座的**引用共享**确定性断言（输出与基座条目对象逐引用相等——TASK-0292 机制护栏，重建即红）+ 宽裕计时记录。
- 实际运行：新 2 例 + teamChatModel 行为 52 例全绿（同轮复跑 54/54）；完整 `bun run check` exit 0（首轮 readonly push 类型与格式红，修复后全绿）。
- 未运行及原因：真实 Desktop 投影耗时对照随 BUG-0127 复测（本测试给出的是合成规模下的量级基线：全投影 ~24ms / 带基座 ~5ms，基座复用收益 ~4×）。
- 发布说明：未更新——纯测试无行为变化，不属于用户可感知交付（交付规则「内部改动留一句」适用于产品代码路径，测试护栏记入 Task 台账）。
- Worktree：未拆出（单测试文件切片）。
- 剩余风险：计时断言在极慢 CI 上有 ~6× 宽裕（先例 canvas 为 ~20×）；引用共享断言为确定性护栏不受机器影响。
