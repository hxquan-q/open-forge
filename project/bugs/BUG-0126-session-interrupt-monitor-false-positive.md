---
id: BUG-0126
type: bug
status: investigating
priority: P3
owner: apps/desktop agent-runtime
requirement:
plan:
source: 用户 dev 运行日志（C:\Users\Chenxuhua\.openforge-dev\desktop-app\logs，2026-10-13）+ 源码静态追踪
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->
# session-interrupt monitor 长任务全程误报 suspected（判据不认识"主控等子代理"）

## 用户流程

- Given：一个团队/长任务运行中，主控会话正在等待子代理返回（不流式、idle > 阈值、但无 completion/pending 标记）。
- When：`session-interrupt-monitor` 周期性调用 `classifySessionInterruptHealth` 评估会话健康。
- Then：期望监控识别"主控等子代理"为正常等待、不报中断；实际：分类器把该状态判为 `suspected`，全程反复发"疑似中断"通知（约 20 次/4h）。

## 实际行为

- 监控编排：`session-interrupt-monitor.ts` 周期性调用 `classifySessionInterruptHealth`。
- 判据：`packages/coding-agent/src/execution/session-interrupt-health.ts` 的 `classifySessionInterruptHealth` 只看 `isStreaming` / `idleMs`（`:71` `SUSPECT_IDLE_MS = 8000`）/ `stopReason` / `hasCompletionMarker` / `hasPendingAction`，**完全没有"主控正在等子代理"的概念**。
- 一个不流式、idle > 8s、又没 completion/pending 标记的主控会话 → 落到 `:158` `suspected` → monitor 发通知。长任务里主控等子代理恰恰就是这个状态 → 全程误报。
- 误报频率：约 20 次/4h（用户日志统计，待补逐字）。

日志 excerpt（逐字，待粘贴）：【待粘贴：~/.openforge-dev/desktop-app/logs，2026-10-13 `suspected` 通知行（约 20 次/4h）】

## 期望行为

1. `classifySessionInterruptHealth` 识别"主控等待子代理"为合法空闲态，不判 `suspected`。
2. 误报频率显著下降（长任务期间不再逐 idle 窗口报）。

## 环境与失败证据

- Windows 11，`~/.openforge-dev`（dev 实例）。
- 代码锚：`packages/coding-agent/src/execution/session-interrupt-health.ts:158`（`suspected` 分支）、`:71`（`SUSPECT_IDLE_MS = 8000`）。

## 最小复现

1. 起一个团队长任务，让主控会话进入"等子代理"态（不流式、idle > 8s、无 completion/pending 标记）。
2. 观察 `session-interrupt-monitor` 是否在该窗口报 `suspected`。

## 影响

- P3：监控噪声，长任务期间反复"疑似中断"通知干扰用户；不丢数据、不影响执行，属可靠性/体验问题。

## 根因证据

- 置信度：高（判据函数逐帧可溯，分类逻辑不含"等子代理"概念）。
- 根因：`classifySessionInterruptHealth` 的判据维度缺失"主控等子代理"语义，纯按 idle 时长+标记判定。
- 未定项：是否应引入"等待子代理"信号（如主控 pending sub-agent 标记），留待修复 Task 定。

## 回归测试（修复时）

- 主控等子代理态（不流式、idle > 8s、有 pending-subagent 信号、无 completion）下 `classifySessionInterruptHealth` 返回非 `suspected`——旧实现红（`suspected`）。

## 修复与验证

- 修复：待实施（立项后建 Task）。建议修法：判据增加"主控等待子代理"识别（复用现有 pending-action/sub-agent 信号），或拉长/豁免该态的 idle 判据。
- 验证：上述回归测试 + monitor 套件；实机长任务观察误报归零。
