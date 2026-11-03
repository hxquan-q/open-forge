---
id: BUG-0170
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: TASK-0425 / code-mode-audit-2026-10-30 §四 F06
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0431]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 切走会话后已开始的 shell 命令永久显示「执行中」

## 用户流程

- Given：会话 A 的 shell 命令已写入终端投屏 feed（running），When：用户切到会话 B 后 A 的 tool.end 到达，Then：A 的 feed 条目应结算为完成并带输出摘要。

## 实际行为

feed 的 A 条目保持 `running:true`、无完成输出。

## 环境与失败证据

- 基线 `98f7de9e6`；独立探针复现（TASK-0425 §四 F06）。
- 根因：普通事件泵（`useSessionEventController.ts:211/215`）与团队泵（`useTeamChatModel.ts:364`）都以「当前会话/挂载会话」闸门拦旧会话事件——保护聊天流防串写是正确的，但 `markAiTerminalEntryDone`（510 行 / 团队 389-394 行）在闸门之后，end 被一起丢弃。

## 最小复现

1. A 会话触发 shell 命令；2. 切到 B；3. A 命令结束 → 观察终端页签 A 条目。

## 影响

投屏列表里留下永不完成的条目，用户误判命令仍占用；无聊天数据损坏。

## 根因证据

报告 §11.1 复核一致（双闸门 211/215；510 行在其后）。

## 回归测试

- 普通：切走（实例 ref 与模块 owner 都不再认 A）后 A 的 tool.end 仍结算条目（running=false、带输出）。
- 团队：卸载/切走后 team end 仍按会话前缀键结算（同构提升，靠既有团队套件回归保持挂载语义）。
- 闸门保护：切走后 A 的聊天事件（delta/tool 面板状态）仍不写入 B 的聊天态（既有 cross-session-leak 测试看守）。

## 修复与验证

- 修复：普通泵 `tool.end` 的 `markAiTerminalEntryDone`（惰性提取）提升到双闸门之前、原位置删除；团队泵 team `end` 结算（会话前缀键）提升到挂载/会话闸门之前、原位置删除。闸门与聊天投影一字未动；start 投影位置不变（cwd 取自当前会话）。
- 测试：新 `useSessionEventController.terminal-settle.test.tsx` 红 1→绿（切走后结算 + 未知键 no-op）；控制器套件（artifact/compaction/memory-bounds/cross-session-leak）13/13 过——闸门保护由 cross-session-leak 看守；团队回归（useTeamChatModel/TeamChatPage/TeamChatDelegationFlow）40/40 过。
- 检查：`check:quick` 通过（ratchet new=0）。完整 check 留批次收尾。
- 未运行及原因：团队切走场景未单列红测（与普通路径同构的一行提升，靠团队全量回归保持挂载语义）；实机走查可选。
