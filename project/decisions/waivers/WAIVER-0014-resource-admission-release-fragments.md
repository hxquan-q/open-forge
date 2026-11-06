---
id: WAIVER-0014
rule: docs/dev/agent-rules/delivery.md 的当前开发版本碎片及同轮正文汇编要求
status: resolved
owner: PLAN-0026-coordinator
reason: Desktop manifest 仍为已打 tag 的 0.1.3，禁止修改已发布正文；本轮资源调度不承担全仓版本准备
risk: 当前已发布正文不含本次候选，下一次版本准备必须确认碎片归属并汇编才能发布
compensation: TASK-0410/0411 候选文案暂存 fragments/v0.1.4；保留 0.1.3 tag 正文与版本，不声明已发布或已汇编；下一次 prepare 纳入校验
created: 2026-10-28
expires: 2026-11-04
---
<!-- Copyright The Open Forge contributors. -->

# 资源准入候选的发布说明暂存

本条只覆盖两个 Task 的发布说明 Policy；延用仓库已有未发布 v0.1.4 碎片暂存位置，但不扩张仅覆盖 TASK-0406/0407 的 WAIVER-0011。0.1.4 为待确认的下一个 patch，不代表 Desktop manifest 已晋升。行为验证、独立审查、集成与推送合同保持不变。

## 处置（2026-11-06）

TASK-0410/0411 的碎片已在 `5b8347d65 release(desktop): 发布 v0.1.4` 中汇编进 `.github/release-notes/v0.1.4.md`，tag `v0.1.4` 已在 `origin/dev`；暂存目的已达成，置 resolved，不续期。
