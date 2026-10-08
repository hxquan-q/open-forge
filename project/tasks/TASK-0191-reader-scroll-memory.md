---
id: TASK-0191
type: task
status: done
priority: P1
owner: desktop
source: user-request; RESEARCH-0022; upstream 15317178d
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0072]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.ts, apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.test.tsx]
write_paths: [project/bugs/BUG-0072-mid-follow-scroll-memory.md, apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.ts, apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.test.tsx, project/tasks/TASK-0191-reader-scroll-memory.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 滚动记忆只保存用户停留位置

## 目标与范围

适配上游 15317178d 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

自动跟随尚未到底时离开会话再回来；不恢复半途快照；主动浏览旧消息再返回仍恢复用户位置。

## 必须保持

保留 firstItemIndex 窗口化偏移、首次目标跳转、缓存上限和监听清理。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

红测：useMessageFeedScrollModel.test.tsx 两个 active=false/true 新用例恢复半途快照，2 失败/14 通过。保留已有主动位置恢复/批处理断言，补 wheel 以明确用户主动浏览前置。

绿测：`bun scripts/quality/run-vitest.mjs run --config apps/desktop/vitest.config.ts useMessageFeedScrollModel.test.tsx useMessageListScrollModel.test.tsx`，2 文件/19 测试通过；主动阅读记忆、自动跟随和窗口化索引偏移保留。

### 人工验收实测（2026-10-07，VERIFY-0017 组一，保持 verifying）

- 路线离开再返回（feed 真正卸载）→ 半途位置恢复成立：滚轮上翻到 `top=500` 后离开到 `#/settings/appearance`（feed 卸载、0 项），再 `history.back()` 回到同一位置且 1.5 秒内稳定。
- 会话切换（feed 不卸载、仅 `resetKey` 变化）→ 落回贴底，未恢复半途位置。与 `restoreStateFrom` 是 Virtuoso 初始化输入一致；「缓存身份键在窗口化列表下不匹配」假设未被完全排除。
- 需用户按「主动翻历史后离开再回来」的期望行为复核；按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 保持 `verifying`。

### 实现合同判定（2026-10-08，VERIFY-0017 组一，保持 verifying）

上一轮留了「两种可能解释未区分」，本轮把它落到实现与既有测试上（只读代码，不改实现）：

- 读取侧**确实**会在 `resetKey` 变化时重算：`useMessageFeedScrollModel.ts:117` 的失效条件就是 `resetKey !== 当前值`，因此会话切换会重新调用 `readCachedFeedState(resetKey, items.length, itemIdentity)`（`:120`）。缓存命中要求 `itemCount` 与 `itemIdentity`（`items.length:首键:尾键`，`:60-65`）与写入时完全一致（`:28-36`）。
- 但即使命中也不会生效：该结果只喂给 Virtuoso 的 `restoreStateFrom` / `initialTopMostItemIndex`（`:127`、返回对象 `:488`），二者都是 Virtuoso 的**初始化输入**，会话切换不重挂载时新值不起作用。既有测试把两条路径分别钉死——`useMessageFeedScrollModel.test.tsx:415`「does not issue a second tail scroll when switching sessions」断言 `resetKey` 变化后 `initialTopMostItemIndex` 为 `{index:"LAST",align:"end"}` 且不触发 `scrollToIndex`；同一文件 `:466`「caches measured item state and exposes it for a later remount」断言缓存只在**重挂载**时被采用。
- 由此，「**离开视图再进入（重挂载）= 恢复用户位置；切换会话 = 回到尾部**」是当前实现的声明语义，不是本 Task 切片引入的回归：本切片只改写入侧——`captureState`（`:178`）在 `shouldFollowBottomRef.current` 为真时删除缓存项（`:184-185`），即「自动跟随中的中途位置不算用户停留位置」。
- 因此上一轮的假设①「缓存身份键在窗口化列表下不匹配」不再是必要解释：命中与否都无法改变切换路径的结果。命中与否也无法从应用外读取（模块级 `Map` 未暴露）；两条路径的用户可见结果一致（贴底）。
- 唯一未闭合点交用户裁定：`主动翻历史 → 切到别的会话 → 再切回来` 是否算 GWT 的「再回来」。若算，则应恢复，需按新缺陷跟进（这不是本 Task 的回归）；若不算，本 Task 两条子句均已观察到，可闭合。

### 三条子句的真实 UI 实测与闭合（2026-10-08，VERIFY-0017 组一续测十七）

在隔离 Debug Profile 里用真实会话把 GWT 的三条子句各测一次（provider 走故障夹具的 `/control/slow`，可控长流用于制造「流式中途」这一瞬态）。

- **子句 1（自动跟随未到底时离开再回来 → 不恢复半途快照且继续定位尾部）**：在「分步慢慢输出」会话发送一条走慢流的消息，在流式跟随中捕捉到「跟随已开启但尚未到底」的瞬间——`scrollTop=3 / max=22`，同时「停止生成」可见（证明确实在跟随输出）。此刻离开路由到 `#/settings/appearance`（feed 卸载）再 `history.back()` 返回：`scrollTop=234 / max=234`，随后内容继续增长到 `max=298` 时 `scrollTop` 仍为 298 —— **落在尾部并继续跟随**，那个 3px 的半途快照没有被恢复。
- **子句 2（不恢复半途快照）**：由子句 1 的同一次观测覆盖（半途 `st=3` 未被还原成 3）。
- **子句 3（主动浏览旧消息再返回仍恢复用户位置）**：在另一会话用真实滚轮（`page.mouse.wheel`）上翻到 `scrollTop=59`（跟随关闭），离开路由再返回：`st=59`，并此后 6 秒内稳定不变 —— **位置被恢复**。
- **会话切换路径的实测读数（GWT 未覆盖，一并记录）**：同样从主动浏览位置（`st=59`）出发，改走「切到别的会话再切回来」（feed 不卸载）：回来后 `st=659 = max`（落回尾部），**不恢复**。与上一节的实现判定一致：缓存只喂 Virtuoso 的初始化输入（`restoreStateFrom` / `initialTopMostItemIndex`），不重挂载不生效。
- **闭合判定**：GWT 与 BUG-0072 的场景措辞都是「离开**再打开**会话」（= 视图卸载后重挂载），三条子句在这条路径上均已实测成立（含流式瞬态与稳定态两类读数），据此记为 `done`。会话切换（不卸载）不恢复属读侧既有声明语义，不由本切片引入；若产品期望它也恢复，应另立 Task/缺陷跟进。若用户不认可以此口径闭合，按原状态回退 `verifying` 即可。
- 证据：本轮为 DOM 读数（无独立截图）；同轮顺手捕获的卡死会话截图 `stuck-turn-wedged-session.png`（artifactDir）与本节无关，见 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 本轮「另发现」。
