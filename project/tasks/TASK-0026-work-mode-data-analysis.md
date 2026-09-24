---
id: TASK-0026
type: task
status: ready
priority: P2
owner: packages/coding-agent
requirement: REQ-0001
plan: PLAN-0001
source_issue: ISSUE-0005
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
write_paths: [packages/coding-agent, packages/runtime-node, apps/desktop]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode]
depends_on: [TASK-0015, TASK-0016, TASK-0017, TASK-0024, TASK-0028]
conflicts_with: [TASK-0018, TASK-0025]
integration_status: pending
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Work 数据分析最小纵向切片

## 目标

在 Work Profile 上交付一条可审查的数据分析流程：导入 CSV、Excel 或 JSON，完成一种明确的清洗/统计请求，预览结果并生成可追溯的 `dataset`/`analysis` Artifact。

## 范围

### 并发评估

- 结论：条件支持；与 TASK-0018/TASK-0025 共用 Work Panel 前先冻结 descriptor/Activity 合同。
- 执行方式：serial（默认）；拆分 Worker 前限定各自的分析器、解析器与 UI 路径。
- 前置依赖：TASK-0015、TASK-0016、TASK-0017、TASK-0024、TASK-0028。
- 集成负责人：coordinator。

### 做

- 校验导入格式、列类型和有问题的行；保留原始输入引用，不静默覆盖；
- 结果先预览，Review 通过后导出清洗数据与带指标/图表引用的分析 Artifact；
- 对缺列、非法值、超限数据和取消明确报告影响行/已完成步骤。

### 不做

- 自研通用图表引擎（复用现有预览能力）；
- 静默修复无法判定的数据、覆盖来源文件或执行云端分析；
- 把所有统计/可视化算法打包成一个无限制的分析器 Tool。

## Given / When / Then

- Given：用户在 Work 数据分析入口导入一个 CSV、Excel 或 JSON 文件；
- When：请求按明确规则清洗数据、计算一项指标并预览结果；
- Then：无效输入和被排除记录可见，原文件未被覆盖，Review 后产出 dataset/analysis Artifact，重开会话可检查输入来源与结果版本。

## 必须保持

- `dataset`/`analysis` descriptor 引用真实文件和输入来源；
- 数据写入与外部导出经过 TASK-0016 的 Tool Policy；
- 用户拒绝/取消不会发生未预览的覆盖写入。

## 测试与验证

- 定向：CSV/Excel/JSON 解析边界、行级校验、取消/部分失败与 Artifact 版本合同测试；
- 用户流程：导入 → 请求分析 → 查看校验/预览 → Review → 导出 → 重开会话查看来源；
- 质量检查：`bun run check:quick`、相关数据/Runtime 包影响测试和 Desktop 组件测试。

## 阻塞

- TASK-0028 已 done。本 Task 与 TASK-0025 共享 Work Panel 写路径并互相冲突，当前必须串行，由 coordinator 选定下一项。数据写入授权不由 WorkspaceMode 控制。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
