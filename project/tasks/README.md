# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。并行执行时必须同时遵守 [`../collaboration/README.md`](../collaboration/README.md)。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

## 状态

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

## Task 要求

- 必须关联 `REQ` 或 `BUG` / `ISSUE`；
- 说明 owner、范围、不做什么和依赖；
- 给出可观察的完成标准；
- 指定测试层级和验证命令；
- 完成后记录实际验证结果；
- 不把多个可独立回滚的 concern 塞进一个 Task。

当前主动 Task：`TASK-0002`–`TASK-0007` 覆盖性能/可靠性基线，`TASK-0008` 覆盖 Task/Artifact 合同，`TASK-0009` 记录品牌化决策冻结；`TASK-0001` 已完成 Project 控制面整理，`TASK-0010`/`TASK-0011` 完成观测与缓存内存上限，`TASK-0012`–`TASK-0014` 驻留上限在途。

`TASK-0015`–`TASK-0022` 对应 `exprot/implementation-plan.md` 阶段 1–7（PLAN-0001）：0015 Task/Artifact 纵向切片（done；显式 Task API，不做自由文本升级分类）、0016 Permission/Approval（draft）、0017 Work Profile（blocked: ISSUE-0005）、0018 文件整理、0019 Coding Profile/Review（blocked: ISSUE-0005）、0020 共享项目目录、0021 Catalog Policy（blocked: ISSUE-0005）、0022 Pi 只读条件评估（blocked: ISSUE-0002）。

`TASK-0023`/`TASK-0024` 为跨阶段 UI/UX 线（`exprot/ui-information-architecture.md`）：0023 双模式 IA 定稿、0024 WorkspaceMode Shell/Mode Switcher 落地，均已完成；0024 只控制项目布局，不改写会话 `agentMode`。

后续纵向切片：`TASK-0025` 本地研究/引用、`TASK-0026` 数据分析、`TASK-0027` Plugin Artifact Renderer、`TASK-0028` 文档处理。0025/0026/0028 共享 WorkspaceMode 面板路径，默认串行；只有在 `exclusive_paths` 划清且合同冻结后才能并行。ISSUE-0006 决定 TASK-0028 的 Task 创建入口，不阻塞 TASK-0015 的通用生命周期实现。
