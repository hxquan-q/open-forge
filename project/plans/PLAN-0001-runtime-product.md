---
id: PLAN-0001
type: plan
status: ready
priority: P1
requirement: REQ-0001
owner: runtime-core/coding-agent/desktop
source: exprot/implementation-plan.md
created: 2026-09-22
updated: 2026-09-22
---

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

## 任务分解（2026-09-22）

- TASK-0015 阶段 1：Task/Artifact 最小纵向切片（in_progress；实现显式 Task API）；依赖 TASK-0008，不负责普通 Chat 自动升级。
- TASK-0016 阶段 2：Permission/Approval L0-L4 与 Project Trust（draft，依赖 0015）。
- TASK-0017 阶段 3a：Work Agent Profile/Prompt/Memory 基础（blocked：ISSUE-0005 的 Profile/mode 边界）。
- TASK-0024：Desktop WorkspaceMode Shell 已完成；只管理项目布局，依赖 TASK-0023 的 IA 定稿。
- TASK-0028 阶段 3a：文档处理纵向切片（blocked：ISSUE-0005/0006；依赖 0015、0016、0017、0024）。
- TASK-0018 阶段 3b-1：分类/批量重命名文件整理（blocked：Work Profile/授权合同与文档入口）。
- TASK-0025 阶段 3b-2：本地研究与来源整理（blocked：Work Profile/授权合同与文档入口）。
- TASK-0026 阶段 3b-3：数据分析纵向切片（blocked：Work Profile/授权合同与文档入口）。
- TASK-0019 阶段 4：Coding Profile、Diff/Review、Git/ETC 与 Test Artifact（blocked：mode/Profile 决策及 0015/0016）。
- TASK-0020 阶段 5：`.vetta`/`.vetta-local` 项目共享目录、schema 与迁移（blocked：阶段 1–4 合同）。
- TASK-0021 阶段 6a：Tool Catalog Profile/project-policy resolver（blocked：ISSUE-0005 与 Task 依赖）。
- TASK-0027 阶段 6b：Plugin Artifact Renderer Registry（blocked，依赖 TASK-0015/0016/0020）。
- TASK-0022 阶段 7：Pi Adapter 只读条件评估（blocked：ISSUE-0002；满足条件后另建实现 Task）。

跨阶段 UI/UX 线（`exprot/ui-information-architecture.md`）：

- TASK-0023：双模式 IA 与 Activity/Approval/Artifact 面板交互设计定稿（done）。
- TASK-0024：Desktop WorkspaceMode Shell、Mode Switcher、WorkPanel 空态及 layout persistence（done；仅控制布局，不重配 Agent Profile）。

待决策门：

- ISSUE-0005：区分项目级 WorkspaceMode、会话级 `agentMode` 与 Tool/Memory Profile；决议前不按 Work/Coding 名称过滤工具。
- ISSUE-0006：冻结何时从 Conversation 创建可恢复 Task；决议前不实现隐式升级。
