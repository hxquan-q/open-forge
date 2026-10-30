---
id: WAIVER-0016
rule: docs/dev/agent-rules/delivery.md 的当前开发版本碎片及同轮正文汇编要求
status: active
owner: delivery-coordinator
reason: Desktop manifest 仍为已有不可变 tag 的 0.1.3，交付修复不得改写 tag 正文，也不承担未经确认的全仓版本晋升
risk: 当前版本正文不含后续候选修复，下次版本准备前必须确认碎片归属并汇编
compensation: TASK-0413、TASK-0405、TASK-0414、TASK-0415、TASK-0416、TASK-0417、TASK-0418 与 TASK-0419 交付修复候选说明暂存 fragments/v0.1.4；不改 v0.1.3 正文，不称当前候选已发布；版本准备时归并并校验
created: 2026-10-29
expires: 2026-11-05
---
<!-- Copyright The Open Forge contributors. -->

# 交付修复候选的发布说明暂存

仅覆盖 TASK-0413、TASK-0405、TASK-0414、TASK-0415、TASK-0416、TASK-0417、TASK-0418 及 TASK-0419 本轮交付修复的发布说明 Policy。内部开发工具及测试说明同样暂存，不延长原到期日。0.1.4 是沿用既有目录的候选暂存位置，不表示版本已经确定或发布。行为测试、完整检查、远端 CI、签名默认门禁、不可变标签及发布授权均不豁免；到期不自动续期。
