---
id: BUG-0182
type: bug
status: verifying
priority: P2
owner: desktop
requirement: REQ-0030
source: user-request / workspace OBS-ALLSTAR-ATTR-001 candidate
related_requirement: [REQ-0030]
related_plan: [PLAN-0027]
related_tasks: [TASK-0430, TASK-0481]
related_issues: []
created: 2026-11-09
updated: 2026-11-09
---
<!-- Copyright The Open Forge contributors. -->

# 已有会话行忽略增量事件的明确模式

## 用户流程

- Given：渲染层已缓存一个同路径会话行，模式尚缺失或不正确。
- When：主进程 `onSessionsChanged` 广播带有效首条消息及明确 agentMode 的同路径会话。
- Then：立即按已知模式投影；coding 会话不继续留在普通侧栏，开发历史可见。

## 实际行为与期望

新插入行已由BUG-0169 / TASK-0430透传agentMode；更新已有行却只补首条消息和时间，继续沿用旧模式。正确归属依赖随后300ms的全量刷新；该刷新迟到或失败时错误展示继续残留。独立审查指出、随后回归测试复现：较早启动的列表请求晚返回，缺模式/旧模式/缺行快照可撤销事件更新，而去重不会自动再拉。期望立即消费明确模式，并保护请求期间收到的更新；无模式旧事件不得擦掉已知模式，事件后启动的新查询仍可正常更新和删除。

## 环境与最小复现

- 基线 `2784c53ed7916aa77284696e9fea8338df244294`；Desktop 0.1.4；Windows 11，Bun 1.4.2，Node 22.19.0。
- Hook + 真实 Jotai store + 真实普通侧栏投影，在 IPC 边界发送合成事件；不启动真实应用/模型。
- 缓存无模式或 work 行 → 对同 sessionPath 发送 coding 增量事件 → 检查缓存模式及普通/开发列表投影；在全量刷新之前必须正确。
- 本条是工作区台账 OBS-ALLSTAR-ATTR-001 已列出的独立源码候选；不声称历史目标会话已命中该前提，也不替代用户那次会话的完整归因。

## 影响、根因与回归

模式是会话列表的投影依据；错误缓存会使coding会话暂时或持续显示在普通列表而不在开发历史。根因已确认：existingIndex分支不消费明确agentMode；列表请求没有保留其等待期间收到的模式事件。修复在事件分支补字段，并让在途Promise持有请求内modeUpdates、回填后统一释放，不增加请求或永久覆盖权威列表。高置信结论只适用于可控前提，不等于历史会话归因。

- 初轮红：生产实现未改时，新测试6例中3个目标断言失败、3个兼容用例通过；缺模式/work→coding仍在普通列表，coding→work仍被排除。
- 初轮绿：补已有行明确模式更新后回归6/6，连同侧栏投影、真实Allstar首页model与项目写流程共4文件24/24通过。
- 续修红：独立审查提出在途旧快照风险后，先以可控Promise补缺模式/旧模式/缺行3例；在初轮已修实现上实测9例中3失败/6通过。
- 续修绿：加入请求内模式事件合并后，同一4文件27/27通过、回归9/9；旧响应后仍保持事件模式和开发卡片，后续新查询可改回work及删除，证明没有永久冻结缓存。
- 流程覆盖：占位/错误缓存 → 真实Hook的IPC listener → Jotai缓存 → 普通投影排除 + Allstar卡片出现 → 可控300ms刷新保持；另覆盖事件前启动的悬置查询晚返回。兼容事件不擦模式，已有标题/有效首条消息/较新时间不变。
- 首轮测试引入fake timers时，原有waitFor等待曾导致2例超时；移除不必要的异步等待后，在尚未修改的生产实现上重新运行，确认只剩上述3个目标断言失败。测试框架超时不计作产品复现。
- 最终影响面、质量门禁和审查结果见 [TASK-0481](../tasks/TASK-0481-session-event-mode.md)。

## 验证边界

不改变模式固化、项目 bucket、会话持久化或 IPC 合同；不把未归册冷启动发现扩展成新功能。历史目标会话、真实 Electron 与 Provider 均未访问。
