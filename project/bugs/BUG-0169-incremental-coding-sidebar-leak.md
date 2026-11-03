---
id: BUG-0169
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 / code-mode-audit-2026-10-30 §四 F09
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0430]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# coding 会话的即时增量行短暂落入普通侧栏

## 用户流程

- Given：用户在 code 版块发起 coding 会话并发首条消息，When：主进程广播 sessions-changed（首条消息事件）且全量 listSessions 刷新尚未到达，Then：普通侧栏不应出现该 coding 会话。

## 实际行为

增量窗口内普通侧栏能投影出该 coding 会话（随后被全量刷新纠正）。

## 环境与失败证据

- 基线 `98f7de9e6`；独立探针冻结全量刷新计时器复现（TASK-0425 §四 F09）。
- 根因链：主进程 `ConversationListChangedEvent.session` 载荷本就不含 `agentMode`（`conversation-list-events.ts:4-9`、唯一带载荷的发射点 `desktop-conversation-service.ts` runTurn 首条消息分支）；preload 类型同样缺失；渲染端 `useProjects` 增量插入只拷贝 id/path/cwd/firstMessage/modifiedAt；投影 `agentMode !== "coding"` 把缺标记按 work 放行（对无记录历史会话是兼容语义，不能反向收紧）。

## 最小复现

1. code 版块新建会话发首条消息，立即观察普通侧栏（或探针冻结刷新计时器）。

## 影响

列表隔离在增量窗口破功，用户看到「普通列表出现代码会话」再消失；无数据损坏。

## 根因证据

报告 §11.1 复核：`useProjects.ts:173-180` 增量插入丢字段、`sidebar-conversation-projection.ts:50` 缺标记放行；本轮源码复核确认事件载荷自主进程起即缺 `agentMode`。

## 回归测试

- 主进程：runTurn 首条消息事件携带 `session.agentMode`。
- 渲染端：onSessionsChanged 增量插入保留 `agentMode`，coding 载荷不进普通投影、work 载荷照常进入。

## 修复与验证

- 修复：`ConversationListChangedEvent.session` 与 preload `onSessionsChanged` 载荷增可选 `agentMode`；runTurn 首条消息分支带 `options.session.agentMode`；`useProjects` 增量插入保留该字段。投影兼容语义（缺标记载荷按 work 放行）未动。相邻必要修复：`desktop-conversation-service.test.ts` 套件此前经 scheduler→task-executor→ipc/session→notifications→window-manager 链在 node 环境收集必失败（HEAD 版本复证实，与本片无关的既有断裂），按套件既有 mock 边界补 `vi.mock("../ipc/session.js")` 单点截断，套件恢复收集；两个被改文件按 TASK-0242 口径补 fork 声明头（ratchet new=0）。
- 测试：主进程红 1（runTurn 载荷缺 agentMode）→ 绿，套件 17/17；渲染端新文件红 2→绿，与 projectWrites/投影 12/12。
- 检查：`check:quick` 通过（ratchet new=0）。完整 check 留批次收尾。
- 未运行及原因：无（窗口级行为由两侧单测锁定；实机不可稳定观察增量窗口）。
