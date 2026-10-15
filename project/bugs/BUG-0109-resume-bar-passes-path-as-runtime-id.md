---
id: BUG-0109
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: 用户提供的实机日志（2026-10-14(2).log，main 9801e62fc）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 续跑条「继续」把持久会话路径当 runtime session id 传给宿主，必然 SESSION_NOT_FOUND

## 用户流程

- Given：某个普通会话的最后一轮回复以可恢复错误收尾，消息列表底部出现「上次回复未完成：[继续]」续跑条。
- When：用户点击「继续」。
- Then：期望按内核既有 retry 语义重跑该轮；实际每次都弹出「继续失败，请稍后重试」，从未成功。

## 实际行为

`2026-10-14(2).log` 中 `vetta:session:retry` 失败 **16 次 / 16 次全部失败**，错误消息里打印的是**会话文件路径**而非任何 id：

```
error Error occurred in handler for 'vetta:session:retry': {
  code: 'SESSION_NOT_FOUND',
  message: 'Session not found: C:\\Users\\Chenxuhua\\.openforge-dev\\agent\\sessions\\--D--Coding-WorkSpace-Vetta--\\YzM3NWQxYjQtZWI0Yy00Mzg5LTk0MGUtMWNlNWE0YWFmMGE1.conversation.jsonl',
  retryable: false, origin: 'runtime'
}
```

该会话 09:51:47 创建、10:03:44 首次点击期间**没有任何 dispose 记录**——不是会话被回收，是键查不到。

## 期望行为

点击「继续」时把该会话的 canonical runtime session id 交给宿主，retry 正常重跑；若会话确实不可重试（忙碌 / recovery_required），按内核既有语义把明确原因透传给用户，而不是笼统的「继续失败」。

## 环境与失败证据

- Open Forge 0.1.3 打包版（`D:\Coding\vetta\open-forge`），Windows 11。
- `2026-10-14(2).log`：`session:retry` 16 次全部 `SESSION_NOT_FOUND`，message 均为同一 `.conversation.jsonl` 路径。
- 反证：渲染层其余所有宿主调用都传 runtimeId（`useSessionMessageSender.ts`、`useUserMessageActions.ts`、`useAnnotationModel.ts`、`useCommandPanelModel.tsx` 等），只有续跑条传路径。

## 最小复现

1. 让某会话的最后一轮以可恢复错误收尾（如 provider 网络中断），底部出现续跑条。
2. 点击「继续」。
3. 观察 `vetta:session:retry` 抛 `SESSION_NOT_FOUND`，message 为 `.conversation.jsonl` 路径，UI 弹「继续失败，请稍后重试」。

## 影响

续跑条是该功能唯一的用户入口，参数错配使其 100% 不可用；且错误文案把「键查不到」伪装成「稍后重试」，用户会反复重试并持续失败。团队会话的成员续跑（`mode: 'continue'`）另受 checkpoint 超时影响，是独立问题。

## 根因证据

- 生产值来源：`useChatViewModel.ts` 的 `sessionId: pendingSessionOpen?.sessionPath ?? activeSessionPath`——**持久会话路径**，注释自述「pending path is the visual identity」。
- 传递：`ChatView.tsx:85` → `SessionFeed` → `SessionMessageList.tsx:85` 原样把 `props.sessionId` 交给 `MessageListFooter`；同文件 `:100` 印证该 prop 就是路径（`session.sessionPath === props.sessionId`）。
- 消费：`MessageListFooter.tsx:44-50` 的 `onResume` 直接 `window.vetta.session.retry(sessionId)`；IPC `main/ipc/session.ts:1026-1030` → `runtime.retry(sessionId)` → `runtime-host-session-operations.ts:205-209` 的 `requireSession(sessionId)` → `runtime-host-session-directory.ts:66-72` 的 `resolveSessionKey` 只查 canonical runtime id 的 identity map，路径永远查不到。
- 为什么测试没拦住：`MessageListFooter.test.tsx` 直接喂 `sessionId="runtime-1"`（按契约是 id），而真实调用方传的是路径——**接缝错配**，单测因此恒绿。
- 置信度：高（日志 message 打印路径本身即决定性证据，且与调用链一一对应）。

## 回归测试

从真实入口（`SessionMessageList` 层）渲染并喂**路径形态**的 `sessionId`，点击「继续」，断言 `window.vetta.session.retry` 收到的是 `activeSessionAtom` 的 `runtimeId` 而非路径；旧实现下该断言失败。

## 修复与验证

- 修复：待实施（见 TASK-0261）。
- 测试：待回写。
- 检查：待回写。
- 未运行及原因：待回写。
