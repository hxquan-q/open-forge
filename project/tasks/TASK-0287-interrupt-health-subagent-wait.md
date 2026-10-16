---
id: TASK-0287
type: task
status: ready
priority: P3
owner: packages/coding-agent + apps/desktop agent-runtime
requirement:
plan:
source: BUG-0126（2026-10-16.log 单日 20 次 suspected 误报实证）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0126]
execution: serial
branch: main
worktree: 未拆出（main 串行实施）
base_commit: 1ebf8ea6e
read_paths: [packages/coding-agent/src/execution/session-interrupt-health.ts, apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts, packages/coding-agent/test/execution/session-interrupt-health.test.ts]
write_paths: [packages/coding-agent/src/execution/session-interrupt-health.ts, packages/coding-agent/test/execution/session-interrupt-health.test.ts, apps/desktop/src/main/agent-runtime/session-interrupt-monitor.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0126-session-interrupt-monitor-false-positive.md, project/bugs/README.md, project/tasks/TASK-0287-interrupt-health-subagent-wait.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-17
updated: 2026-10-17
---
<!-- Copyright The Open Forge contributors. -->

# session-interrupt 健康判据识别「主控等子代理」，消除长任务全程误报

## 目标

修复 BUG-0126：`classifySessionInterruptHealth` 不再把「主控会话等待子代理返回（不流式、idle 超阈、无 completion/pending 标记）」判为 `suspected`，长任务期间不再逐 idle 窗口发"疑似中断"通知。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无（coding-agent execution 面独占）
- 前置依赖：无
- 冲突文件/独占路径：`session-interrupt-health.ts` 及其测试
- Branch：main
- Worktree：未拆出
- 集成负责人：Coordinator（本会话托管）
- 集成顺序：main 串行

### 做

- `packages/coding-agent/src/execution/session-interrupt-health.ts`：判据增加「存在活动中的子代理/委派上下文」信号（复用现有 pending-action/子代理会话登记面；若信号不可达 monitor，先打通最小只读输入），该态即使 idle > `SUSPECT_IDLE_MS` 也归类为合法等待（非 suspected、非 healthy 干扰）。
- monitor 侧仅透传新分类，不改通知通道。

### 不做

- 不动 `SUSPECT_IDLE_MS` 阈值本身。
- 不改真实中断（provider 断连、错误态）的判定与恢复路径（BUG-0082/0085 语义保持）。

## Given / When / Then

- Given：团队/长任务中主控会话不流式、idle > 8s、无 completion/pending 标记，但存在活动子代理。
- When：monitor 周期调用 `classifySessionInterruptHealth`。
- Then：旧实现落 `suspected` 并通知（实测单日 20 次）；新实现识别为等待子代理，不发 suspected 通知；无子代理时的真实中断判定不变。

## 必须保持

- 真中断（error/无子代理 idle）仍按原路径 suspected/notify，恢复语义不变。
- 判据为纯函数、输入显式，不引入隐式全局状态。

## 测试与验证

- 定向测试：`session-interrupt-health.test.ts` 新增「有活动子代理 + idle 超阈 → 非 suspected」回归（旧实现红）；「无子代理 idle 超阈 → suspected」既有用例保持红绿不变。
- 质量检查：coding-agent 包内测试 + `test:impact` + 完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行，push origin main:dev。
- 人工功能验收：待验收（实机长任务观察误报归零，归 BUG-0126 验收包）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：团队会话长任务，主控等待子代理窗口 > 8s。
- 预期行为与最终产物：无"疑似中断"通知；真中断仍及时通知。
- 不通过表现与已知限制：长任务期间仍反复 suspected 通知。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：（实施后回填）
- 实际运行：（实施后回填）
- 未运行及原因：（实施后回填）
- Worktree：未拆出（串行小改，main 直接实施）
- 剩余风险：（实施后回填）
