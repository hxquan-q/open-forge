---
id: TASK-0268
type: task
status: ready
priority: P2
owner: packages/runtime-core + apps/desktop
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream a98f55365 + 2d4fb93d9 + 64c3ff927
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0262]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: 待实施时定（依赖收口后的干净基线）
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md, project/bugs/BUG-0110-compaction-commit-version-race.md]
write_paths: [packages/runtime-core/src/kernel/turn-pipeline.ts, packages/theme-ui/src/chat, apps/desktop/src/renderer/domains/conversation, project/tasks/TASK-0268-compaction-in-reply-step.md]
exclusive_paths: [packages/runtime-core/src/kernel/turn-pipeline.ts]
depends_on: [TASK-0264]
conflicts_with: []
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 自动压缩改为回复内步骤（同步上游 0.5.64，defer 至依赖收口）

## 目标

上游把回复过程中触发的自动上下文压缩从「分割线截断回复」改为「这条回复里的一个步骤」：进行中转圈、完成标注压缩前上下文大小、可展开看摘要、回复完成后与其他步骤一起折叠；手动压缩仍用分割线。runtime 侧压缩记录带上所属 Turn 并随运行中回合回放。

## 范围

### 并发评估

- 结论：不支持并行——`turn-pipeline.ts` 与 conversation 渲染文件正是 TASK-0260/0261/0262 在途改动
- 执行方式：serial，等依赖收口并入库后从干净基线开始
- 前置依赖：TASK-0262（BUG-0110 压缩持久化竞态收口）、TASK-0264
- Branch：main；Worktree：视届时主树状态定

### 做

- 依赖收口后先对照本仓压缩渲染路径与本仓消息列表架构（与上游 feed 分叉），定 adapt 形状再实施；含 runtime 压缩记录带 Turn、theme-ui 步骤视图、渲染接线、双等待提示修复。

### 不做

- 不整段搬上游 ADR-0146/0147 消息列表重构；不改变压缩触发阈值与策略设置。

## Given / When / Then

- Given：长会话流式回复中上下文超阈值触发自动压缩；When：压缩执行并完成后回复继续；Then：压缩在本条回复内显示为步骤（可展开摘要），回复完成后随步骤折叠，不再出现分割线截断与双等待提示；手动压缩行为不变。

## 必须保持

- BUG-0110 修复的持久化串行语义不回退；压缩失败/超时的可观测行为保留。

## 测试与验证

- 定向：turn-pipeline 压缩事件合同 + 组件渲染测试；质量：`test:impact`、批末 `bun run check`。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。人工功能验收：待验收。发布：未授权。

## 功能验收包

- 入口：长会话自动压缩；预期：步骤化显示；不通过：分割线截断或双等待提示。

## 交付记录

- 实际修改：待回填；实际运行：待回填；未运行及原因：待回填；Worktree：待回填；剩余风险：待回填
