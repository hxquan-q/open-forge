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

`TASK-0015`–`TASK-0022` 对应 `exprot/implementation-plan.md` 阶段 1–7（PLAN-0001）：0015 Task/Artifact 纵向切片（ready）、0016 Permission/Approval L0-L4、0017 work 模式骨架+文档入口、0018 work 其余三入口、0019 coding 增强、0020 共享项目目录、0021 生态分层收口、0022 Pi 评估（blocked，条件触发）。

`TASK-0023`/`TASK-0024` 为跨阶段 UI/UX 线（`exprot/ui-information-architecture.md`）：0023 双模式 IA 与面板交互设计定稿（coordination-only，可与 0015/0016 并行）、0024 Shell/Mode Switcher/面板容器落地（串行，依赖 0017+0023，独占 root-layout）。
