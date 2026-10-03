---
id: BUG-0071
type: bug
status: verifying
priority: P1
owner: runtime-core
source: RESEARCH-0022; TASK-0190 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0190]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 回合恢复成功仍报告旧错误终态

## 用户流程与复现

同回合先发生模型/运行时错误，后续调用恢复成功，最后结束。应报告自然结束以保持队列策略正确；旧实现仍报告 error。

## 环境与证据

Windows / Open Forge 0.1.3，Node runner + runtime-core config 的 running-changed-reason.test.ts：两个真实事件序列均得到 error 而非 agent_end，2 失败/9 通过。未使用真实 Provider。

## 根因与回归

旧代码仅在 message.final 兼容分支清错，真实 assistant done 未清错。新增 runtime/assistant 两种错误来源的恢复测试，并保护恢复后最终失败/取消；旧事件兼容测试保留。

## 修复与验证

由最后一次 assistant done 更新终态，缓冲上限、错误旁路和旧协议兼容不变。实际结果见 TASK-0190/TASK-0187。
