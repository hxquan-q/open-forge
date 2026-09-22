# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

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

当前主动 Task：`TASK-0002`–`TASK-0007` 覆盖性能/可靠性基线，`TASK-0008` 覆盖 Task/Artifact 合同，`TASK-0009` 记录品牌化决策冻结；`TASK-0001` 已完成 Project 控制面整理。
