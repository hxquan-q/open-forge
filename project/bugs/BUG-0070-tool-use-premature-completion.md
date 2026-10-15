---
id: BUG-0070
type: bug
status: verifying
priority: P1
owner: desktop
source: RESEARCH-0022; TASK-0189 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0189]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 工具调用间隙回复被提前标为完成

## 用户流程与复现

发送需要 read 等工具的任务；模型以 toolUse 结束单次调用，然后执行工具并继续回答。回复应持续进行且累计每次调用的 usage，只有最终完成/失败/取消才有终态。旧共享投影将每次 done 都标为 completed 并写入 endedAt。

## 环境与失败证据

Open Forge 0.1.3 / Windows；Node runner + Desktop config 的 message-stream.test.ts：新增用例期望 streaming，实际 completed，1 失败/5 通过。接口级复现含工具块和去重，未运行真实模型。

## 根因与影响

mergeTerminalMessage 未区分 toolUse 与整段回复终态，影响普通会话/Team 的完成显示与耗时统计，不代表工具被取消。

## 修复与验证

保留 toolUse 的 streaming 并累计 usage；最终调用和 sequence 去重保持。回归包含最终 duration/usage 与既有失败/取消，完整结果见 TASK-0189/TASK-0187。
