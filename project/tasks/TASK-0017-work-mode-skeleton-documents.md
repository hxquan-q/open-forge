---
id: TASK-0017
type: task
status: draft
priority: P1
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
depends_on: [TASK-0016]
conflicts_with: [TASK-0018, TASK-0019]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# work 模式骨架 + 文档处理入口（implementation-plan 阶段 3a）

## 目标

建立 work/coding 双入口骨架：Mode Switcher、独立 Agent Profile/Prompt/Tool Catalog
分流（共享 Runtime/Task/Artifact/Permission），并交付第一个 work 能力——
文档处理（总结、改写、翻译、报告、会议纪要）端到端闭环。

## 范围

### 并发评估

- 结论：不支持并发（Mode Switcher 与 Profile 分流是后续 work/coding 任务的公共地基）
- 执行方式：serial
- 前置依赖：TASK-0016（Approval 控制 Shell/网络类副作用）
- 冲突：TASK-0018/0019（同改 Profile 装配与入口 UI）
- 集成负责人：coordinator

### 做

- work/coding Mode Switcher 与 Profile 装配（各自 Prompt/Tool Catalog/Memory）；
- 文档处理入口：选文件 → 自然语言目标 → Agent 计划 → Document Artifact → 预览/Review → 导出；
- Tool Catalog 按 mode 收敛（work 默认不含 Shell 写类工具）。

### 不做

- 批处理/研究/数据分析入口（TASK-0018）；
- coding 侧增强（TASK-0019）；
- 云端执行。

## Given / When / Then

- Given：用户切换到 work 模式并选中一个本地文档；
- When：输入「总结成一页会议纪要」并走完生成→预览→导出；
- Then：产出 document Artifact 可预览、可 Review、可导出到指定目录；切换回 coding 模式后 Tool Catalog 不互相扩大。

## 必须保持

- 两模式共享 Runtime/Task/Artifact/Permission 基础设施；
- work 与 coding 的 Tool Catalog 不静默互相扩大；
- 模式切换不打断进行中的 Task。

## 测试与验证

- 定向：Profile/Tool Catalog 分流合同测试、文档入口流程测试；
- 用户流程：选 work → 文档处理 → Artifact 预览导出；
- 质量检查：`bun run check:quick`、desktop tsc。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
