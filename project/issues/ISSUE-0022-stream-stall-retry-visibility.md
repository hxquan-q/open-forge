---
id: ISSUE-0022
type: issue
status: draft
priority: P1
owner: packages/ai + apps/desktop
related_requirement: []
related_plan: [PLAN-0010]
source: 现场会话诊断「长时间卡住」+ provider-retry 与 MessageListFooter 代码复核
created: 2026-09-25
updated: 2026-09-25
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 流式停滞换连对用户是否可见：缺陷还是文案/分类增强

## 背景

用户反馈会话偶尔「长时间卡住不回复」。已确认 `packages/ai` 的重试层对流式停滞有 180 秒判定
（`PROVIDER_STREAM_IDLE_TIMEOUT_DEFAULT_MS = 180_000`、内部 `STREAM_IDLE_STALLED` 符号），
即「卡住」很可能就是这条路径：等待 180s 后重连。问题在于**这段时间用户是否得到解释**，
以及重连动作是否被正确分类展示。

## 已知事实

- `packages/ai/src/provider-kit/provider-retry.ts`：统一重试层同时负责请求建立与流阶段；文件注释
  声明 `retry` 事件用于把重试活动暴露给上层；停滞超时常量默认 180s。
- `apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx`：
  已消费 `retryProgressAtom`，经 `classifyChatError(retryProgress.errorMessage)` 得到分类，
  用 `messageList.retryIndicator`（带 `attempt`/`maxAttempts`）与 `messageList.retryReason` 渲染。
- `MessageListFooter.test.tsx` 已覆盖「正在重新连接（n/m）」与原因文案的渲染。
- 结论：**渲染侧与事件通道都已存在**；不确定的是停滞分支是否走同一条 emit 路径、是否被分类成
  可读原因，以及停滞期间该指示是否真的出现在气泡页脚。

## 未决问题

1. 用户报告的「卡住」是否就是这条 180s 停滞路径（也可能是工具调用、IPC 或渲染侧等待）？
2. 停滞分支是否与其它可重试失败共用同一次 `retry` 事件发射？
3. 若已发射，`classifyChatError` 能否把停滞原因映射为面向用户的文案，而不是原始错误串？
4. 流式未完成期间，气泡页脚的重连指示是否真的可见（而不是只在下一行出现）？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A：已接线，仅补分类与文案（可选 `cause: "stream_idle"` + i18n key + 组件断言） | 改动小，不触协议语义；用户能看懂「正在重新连接」的原因 | 需要先用一次可重复的停滞确认现状 | 若停滞实际未发事件，A 会掩盖真正的缺陷 |
| B：停滞分支未发射 `retry`，按缺陷处理（补发事件 + fake-clock 单测 + 组件测试） | 直击根因；停滞不再静默 | 触及 `@vetta/ai` 事件面，需要契约测试与回归用例 | 需要确认不与既有重试预算/退避语义冲突 |
| C：不动 | 零成本 | 用户仍可能只看到「卡住」 | 若现状确实不可见，问题保留 |

## 推荐

先做**判别性复现**，再决定 A 或 B：用 fake provider + 可控时钟在 `packages/ai` 单测中制造停滞，
断言 `retry` 事件（含原因）是否发出；若发出，再看 `classifyChatError` 对该原因的分类结果，
据此确定是「只补文案」还是「先修缺陷」。真实路径复现可用已挂载的 dev 实例观察 180s 窗口内的界面。
无论走哪条，都不改重试预算、退避与终止条件（保持现有 `retry` 语义）。

## 决策触发条件

- 得到一次可重复的停滞观察（单测或 dev 实例），或用户补充「卡住」时的界面表现与时长；
- 若确认停滞静默或分类不可读 → 转 Bug（新编号）并按 Bug 流程修复。

## 后续 Task

- `@vetta/ai`：`AssistantMessageRetryEvent` 可选 `cause`（`rate_limit` / `transient` / `stream_idle`）
  与停滞分支的结构化日志（向后兼容，不改事件顺序）。
- `apps/desktop`：`classifyChatError` 识别 `stream_idle`；`chat.messageList.retryIndicatorStreamIdle`
  的 zh/en 文案；`MessageListFooter` 组件断言「停滞重连可见、且不新增消息行」。
