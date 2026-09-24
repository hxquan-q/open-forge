---
id: PLAN-0001
type: plan
status: in_progress
priority: P1
requirement: REQ-0001
owner: runtime-core/coding-agent/desktop
source: exprot/implementation-plan.md
created: 2026-09-22
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# work/coding Runtime 产品演进

## 路线

```text
阶段 0：合同冻结
  → 阶段 0.5：性能与可靠性基线
  → 阶段 1：Task/Artifact 最小纵向切片
  → 阶段 2：Permission/Approval
  → 阶段 3：work 模式
  → 阶段 4：coding 模式增强
```

## 硬约束

Task 不创建第二套 Agent Loop；Artifact 不创建第二套文件事实源；Permission/Approval 不依赖 Prompt；Renderer 不持有最终状态。

详细阶段、Owner 和禁止事项以 [`exprot/implementation-plan.md`](../../exprot/implementation-plan.md) 为研究来源。

## 任务分解（2026-09-23 校准）

阶段 0.5–6a 已全部落地：

- TASK-0015 阶段 1：Task/Artifact 最小纵向切片（done；显式 Task API，不做普通 Chat 自动升级）。
- TASK-0016 阶段 2：Permission/Approval L0-L4 与 Project Trust（done）。
- TASK-0017 阶段 3a：Work Agent Profile/Prompt/Memory 基础（done；ADR-0128 三轴分离，ISSUE-0005 裁决方案 C）。
- TASK-0018 阶段 3b-1：分类/批量重命名文件整理（done）。
- TASK-0019 阶段 4：Coding Profile、Diff/Review、Git/ETC 与 Test Artifact（done；风险分级 + Artifact 登记）。
- TASK-0020 阶段 5：`.vetta`/`.vetta-local` 项目共享目录、schema 与迁移（done）。
- TASK-0021 阶段 6a：Tool Catalog Profile/project-policy resolver（done；Profile×选择×项目策略收敛）。
- TASK-0022 阶段 7：Pi Adapter 只读条件评估（archived；ISSUE-0002 常设裁决不启动）。
- TASK-0023 / TASK-0024 跨阶段 UI/UX 线（done）：双模式 IA 定稿 + WorkspaceMode Shell（仅控制项目布局，不重配 `agentMode`）。

剩余切片：

- TASK-0027 阶段 6b：Plugin Artifact Renderer Registry（blocked，依赖 TASK-0068 Plugin SDK renderer/schema API；0015/0016/0020/0021 均已完成）。
- TASK-0028 阶段 3a：文档处理纵向切片（done；ISSUE-0006 显式 Task 创建边界，Work 右栏入口已合入主工作区）。
- TASK-0025 阶段 3b-2 本地研究、TASK-0026 阶段 3b-3 数据分析（ready；前置 TASK-0028 已完成；0025 与 0026 共享 WorkspaceMode 面板路径并互相冲突，不支持并行）。

已裁决决策门：

- ISSUE-0005：done——已裁决方案 C：`WorkspaceMode` 只管项目布局，`agentMode` 保持提示词偏向，Tool/Memory 差异由 `agentProfileId` 固化到新 Session；切换布局不静默重配在运行 Session。
- ISSUE-0006：done——普通 Chat 保持 Conversation；只有用户显式升级或注册的持久工作流入口创建 Task，不按 Prompt 复杂度自动升级；TASK-0028 已按此合同实施。
