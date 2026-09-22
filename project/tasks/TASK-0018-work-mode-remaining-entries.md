---
id: TASK-0018
type: task
status: draft
priority: P2
owner: coding-agent/apps-desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/coding-agent, apps/desktop]
write_paths: [packages/coding-agent, apps/desktop]
exclusive_paths: []
depends_on: [TASK-0017]
conflicts_with: [TASK-0017, TASK-0019]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# work 模式其余三入口：批处理/研究/数据分析（implementation-plan 阶段 3b）

## 目标

在 work 骨架上补齐剩余入口：文件批处理（分类/重命名/提取/转换/合并）、
研究/知识库（本地资料检索、引用、来源整理）、
数据分析（CSV/Excel/JSON 清洗、统计、图表、报告）。

## 范围

### 并发评估

- 结论：条件支持——三个入口互相独立，但都改 work Profile/入口 UI，
  拆给多个 Worker 需在任务内再声明 exclusive_paths
- 执行方式：serial（默认）；并行需二次拆分
- 前置依赖：TASK-0017（骨架与首个入口定模式）
- 集成负责人：coordinator

### 做

- 三个入口各自的 Skill/Prompt 资源、Tool Catalog 选择、Artifact 类型
  （dataset/analysis/research-evidence）、Approval/Review 规则；
- 每个入口的失败与取消路径、用户常见流程测试。

### 不做

- 为每个领域建独立 Runtime（主 Agent + Skill/专家能力实现）；
- 图表渲染引擎自研（复用现有预览能力）。

## Given / When / Then

- Given：work 模式下用户选中一批文件或数据集；
- When：分别执行批量重命名、资料整理引用、CSV 统计出图三条流程；
- Then：产出对应类型 Artifact，来源与引用关系可溯，失败路径有终态，Review 通过后才落盘交付。

## 必须保持

- 每类 Artifact 的 descriptor/来源/验证语义符合 TASK-0008 合同；
- 批量操作可取消、失败项有明确终态（不静默跳过）。

## 测试与验证

- 定向：三入口各自的 Skill 装载与 Artifact 产出测试；
- 用户流程：三条 MVP 验收流程；
- 质量检查：`bun run check:quick`、相关包全量测试。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
