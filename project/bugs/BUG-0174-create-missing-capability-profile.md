---
id: BUG-0174
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0028
source: 用户实机验收反馈（2026-10-30，TASK-0434 热追踪验收）
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0437, TASK-0434]
related_issues: []
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 交互式新建会话后终端热跟踪失灵、终端页签空白

## 用户流程与实际行为

- 用户经版块入口新建 code 会话发首条消息，AI 执行 shell（`ls`）：聊天流工具卡正常显示，但右侧不自动切终端页签；手动切到终端页签显示空白。浏览器跟随正常。

## 环境与失败证据

- 用户 dev 实机（2026-10-30 对话记录：`ls` → 「后台任务 b1 已完成」，随后 browser_tab 正常打开并跟随）。
- 根因链：主进程 `CHANNELS.CREATE` handler 返回只透传 `sessionId/sessionPath/cwd/agentProfileId`，丢弃 service 已返回的 `agentMode/capabilityProfile`（`ipc/session.ts:965-972`；service 在 `desktop-conversation-service.ts:278-279` 已携带）→ 渲染端 `activeSessionAtom` 恒缺 `capabilityProfile`（`useSessionOpener.ts:509-510` 条件展开落空）→ TASK-0434 的 §11.3 生产端门控（`capabilityProfile === "coding"`）对交互式会话恒 false → 终端 feed/编辑目标不写，页签空白；浏览器跟随不经该门故正常。

## 最小复现

1. 版块入口新建 code 会话 → 让 AI 执行 shell 命令 → 观察终端页签。

## 影响

§11.3 收敛后 code 会话自身的终端投屏/文件跟随全链失效（P1 回归显形；根因是 IPC 映射缺字段的历史缺口）。

## 根因证据

源码对照如上；浏览器跟随正常+终端空白的不对称指向生产端门控，而非消费端。

## 回归测试

- 源码断言（agent-mode-ipc.test 同款先例：handler 无注入边界）：CREATE handler 返回透传 `agentMode` 与 `capabilityProfile`（旧源码红）。
- 渲染端消费既有（conditional spread），由 tsc 与 TASK-0434 各套件看守。

## 修复与验证

- 修复：`CHANNELS.CREATE` handler 返回补 `agentMode: result.agentMode` 与 `capabilityProfile: result.capabilityProfile` 透传（service 已算出）。
- 测试：源码断言红 1→绿（handler 无注入边界，沿用 agent-mode-ipc.test 先例）；渲染端消费为既有条件展开，由 tsc 与 TASK-0434 套件看守。
- 检查：`check:quick` 通过（ratchet new=0）。完整 check 与 TASK-0436 合跑收尾。
- 未运行及原因：实机复验待用户（重启 dev 后新建 code 会话让 AI 跑 shell，终端应投屏并自动切页签）。
