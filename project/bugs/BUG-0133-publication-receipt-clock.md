---
id: BUG-0133
type: bug
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: TASK-0325 self-review of publication clock boundary
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0324, TASK-0325]
related_issues: []
created: 2026-10-19
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 正常服务稍后签发的发布回执被发起时刻误拒绝

## 用户流程与实际行为

Given 有效最终候选和可信发布器，When 子进程在请求开始之后按自身时钟签发回执，Then 控制器应在接收时刻验证有效期与签名；当前 dispatch 将发起时刻传入验签，issuedAt 稍后就被当成未来回执拒绝，误记 publication-unknown。

## 根因与回归

TASK-0324 的发布器夹具用 `request.requestedAt - 100` 签发，固定时钟覆盖了灰度推进，却没有反映实际调用延迟。TASK-0325 先把服务夹具改为真实签发时刻建立失败证据，再在不放宽时间/签名/对象约束的前提下修复。实际代码和测试结果随后回填。

回归实际先红：真实子进程按签发时刻出具回执，8 例中 4 例失败，正常发布与查询被记为 publication-unknown。改为接收时刻验签后同一 8 例全部通过；补充真实未来、过期和有效结构但被篡改的签名拒绝断言。TASK-0325 已集成本地 main；组合 test:changed 46/46 包通过，发布时钟回归继续覆盖在 CLI 套件中。真实外部服务仍未配置，最终合并前完整 check exit 0。

## 不变量

真实未来/过期、错 subject、错角色和错幂等键继续拒绝。响应未知仍只查询，不盲目重发；不得将本地意图写成发布事实。
