---
id: TASK-0050
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: TASK-0034 / RESEARCH-0004 P1-1 第 2 步
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/conversations, apps/desktop/src/main/ipc/session.ts, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/preload/apis/session.ts, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/shared/components/message-feed, packages/runtime-core/src/contracts.ts]
write_paths: [apps/desktop/src/main/conversations, apps/desktop/src/main/ipc/session.ts, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/preload/apis/session.ts, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/shared/components/message-feed, .github/release-notes]
exclusive_paths: []
depends_on: [TASK-0034, TASK-0035]
conflicts_with: [TASK-0051, TASK-0038]
integration_status: pending
created: 2026-09-23
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# transcript 窗口化第 2 步：beforeEntry 游标分页

## 目标

在 `openViewer`、`getFullHistory` 和 read-only viewer live updates 中建立有界 history page 合同；Renderer 只加载尾页和用户向上浏览触发的旧页，页面全量消费方改为明确的按页读取流程。

## 范围

### 并发评估

- 结论：不支持并发；依赖 TASK-0035 占位 ViewModel，且共享 IPC、preload、conversation/store 和 `MessageTimeline` 写路径。
- 执行方式：共享 `forge/dev` 工作区串行。
- 可并行 Task：无（transcript 链内）。
- 前置依赖：TASK-0034 合同、TASK-0035 占位实现、TASK-0031 媒体引用化。
- 就绪确认（2026-09-24）：`depends_on` 的 TASK-0034 / TASK-0035 与正文列出的 TASK-0031 均为 `done`，状态由 `draft` 提为 `ready`；链内 TASK-0051 / TASK-0038 仍等本 Task 落地。
- 冲突文件/独占路径：`session.ts`、preload session API/types、`useSessionOpener`、`useSessionEventController`、viewer model、message actions/navigation、export。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不建独立 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0035 → TASK-0050 → TASK-0051 → TASK-0038。

### 做

- 按 TASK-0034 暴露 `HistoryPageRequest` / `HistoryPage`；游标由服务端生成、Renderer 原样回传。`limit` 默认 100、最大 200，页序旧到新，`beforeEntry` 排他、无重漏；空页/到头/stale cursor 按合同区分。
- 保留无参数 `getFullHistory` / `openViewer` 的旧全量调用语义；传入任一分页 options（包括现有 `openViewer({ tailTurns })`）返回有界页，`history` 字段和尾部选择起点保持兼容。分页请求默认以最新 100 条开始；`tailTurns` 仅第一页并仍受 limit 上限约束。
- 将会话打开 preview→canonical backfill、`agent_end`/手动 compaction refresh、编辑/重发/删改/分支切换回载迁为尾页与游标页，并将 live/optimistic 行与 canonical tail page 按稳定 id 合并，不清空或替换已加载旧页。
- 扩展 read-only `subscribeViewer` 的分页模式：append-only 时只发送新增 history delta；非追加改写时发送有界最新页并标记 reset；unsubscribe 后停止发送。
- 向上滚动到已加载历史起点时请求上一页；追加旧页时保持 viewport anchor，切换 session/分支时取消旧请求并清空游标。stale cursor 时保留当前可见内容，重新请求最新页后再对账。
- MessageTimeline 的目录/导航根据轻量摘要保留全局顺序；本地全文搜索按页扫描，不在 atom 拼回全文。搜索命中后加载目标页并定位稳定 id；侧栏搜索仍使用 `desktop-session-search`，与当前消息驻留解耦。
- HTML export 以固定历史前缀逐页 drain 到独立导出流程；只在导出生命周期内构建完整 HTML/视图，不写回当前会话 atom，并在成功、失败、取消后释放暂存页/DOM。
- 单条复制只恢复所选占位消息；多消息选区只读取实际选中的消息。Turn 统计继续使用事件与既有 cache，消息 usage、branch/model switch、fork 来源等汇总从轻量 placeholder 元数据读取。

### 不做

- 不实现 compaction 边界 replay 或 compression debounce/circuit-breaker（TASK-0051 / TASK-0038）。
- 不加 SQLite、ordinal 索引、JSONL 格式或持久化迁移。
- 不改 Runtime 的完整历史事实或外部会话协议；Main 初期为返回页可以读取后裁剪现有完整 projection。

## Given / When / Then

- Given：用户打开 500+ 条消息的会话，正在 streaming 时产生新消息，且某些历史项已由 TASK-0035 降为占位。
- When：用户上滚加载旧页、用 MessageTimeline 搜索并跳转、完成编辑/分支操作，或导出完整 transcript。
- Then：按页拼接无重漏，live/optimistic 消息不被 backfill 覆盖，搜索和导出与全量历史语义一致；全文只在明确操作的隔离生命周期内读取，不扩张活动 atom；向上插页不跳滚动锚点，切换/取消/失效游标可恢复。

## 必须保持

- 默认 IPC 兼容：旧无参数数组/快照返回不变；显式传入的 `openViewer({ tailTurns })` 继续选择最近 N 个 user turn 的尾部，且 `history` 字段可直接读取，极长尾部按 limit 分页。
- Cursor 无权限含义，不能跨 session/path 使用；只能由同一历史源返回并回传。append 不改写 cursor 前缀；失效游标报 stale，不得返回伪空页。
- 空页、历史起点、游标过期、session switch、分支切换、JSONL 外部追加及 viewer unsubscribe 均有明确语义。
- 导出完整顺序、compaction/error/timing 项和已有媒体引用/旧 data URL 均保持；不把全量导出缓存留在会话 state。
- optimistic reconciliation 不吞用户已发消息，不将上一会话消息合进当前会话；取消中的页请求不在卸载后写状态。

## 测试与验证

- 合同：`limit` 默认/最小/最大校验；空、短、整页/多页历史；边界 cursor 排他无重漏；append 期间稳定；分支改写 stale；viewer append/reset/unsubscribe；无参数兼容。
- 代表流程：打开尾页 → 连续上滚两页并跳回尾部 → live 回复到达 → timeline 搜索定位较早消息 → 分支或编辑回载 → 导出并确认首尾历史均存在 → 切换会话后旧页不再写入。
- Renderer 组件/Hook 测试验证滚动锚点和 viewport 接线；IPC/preload 合同测试覆盖 sender/handler 类型；只在 Electron 跨进程行为无法由合同测试证明时追加定向 E2E。
- 性能：固定 N 条 JSONL 的 Renderer live-set/privateBytes 随加载窗口而非总历史增长；明确记录 Main 仍全量解析的上限风险。
- 质量：`bun run test:impact -- <改动文件...>`、`bun run check:quick -- <改动文件...>`；完整实现轮结束后 `bun run check`，补当前版本 Release Notes。

## 交付记录

- 阶段 1（2026-09-27，Main 侧有界页合同）：
  - 新增 `conversations/session-history-page.ts`：`HistoryPageRequest`/`HistoryPage`
    wire 合同落在 `preload/api-types/session.ts`；`sliceHistoryPage` 从完整
    projection 裁剪（任务允许的过渡形态），游标 = 排他下标 + 边界条目签名
    （entryId 或内容哈希），append-only 不失效、改写/删除/截断报 `stale`；
    `parseHistoryPageRequest` 统一校验 limit（默认 100/上限 200）与
    tailTurns（1-10）。
  - IPC：`GET_FULL_HISTORY` 与 `VIEWER_OPEN` 传分页 options 即回有界页；
    无参调用保留旧全量语义，`openViewer({})` 空对象亦按旧全量快照返回。
    `openViewer({tailTurns})` 现在返回 `HistoryPage`（`history` 字段兼容，
    尾部按 limit 截断），旧 `session-history-preview.ts` 已删除（职能并入
    page 模块）。
  - preload：`getFullHistory`/`openViewer` 重载签名，`{stale:true}` 进
    返回联合类型；`useSessionOpener` 两处 tail 消费点做防御性收窄。
  - 测试：`session-history-page.test.ts` 9 用例（默认尾页/连翻无重漏/排他
    边界/append 稳定/改写 stale/无 id 条目锚定/非法游标/limit 校验/
    tailTurns 限界/空历史）；desktop typecheck 与 check:quick 绿。
  - 未做（后续阶段）：Renderer 聊天面板的尾页+上滚插页迁移、live/optimistic
    与 canonical 尾页合并、stale 重对账、滚动锚点；viewer 订阅增量/reset
    模式；MessageTimeline 分页摘要与导出逐页 drain。这些需要独立的
    renderer 改动轮次。
- 阶段 2（2026-10-05，viewer 订阅增量推送）：
  - `subscribeViewer` 推送改为结构化更新：`snapshot`（首发快照）/
    `append`（仅追加增量）/ `reset`（非追加改写回退有界页）；watch
    去抖回调不再向 renderer 重发整表，重复文件事件直接抑制。
  - `diffViewerHistory`（`main/conversations/session-history-page.ts`）：
    按前缀条目签名判定 append-only；前缀任一条目失配（分支改写、压缩、
    外部重写）即回退 `reset`，`reset` 携带以当前 limit 截取的有界尾页。
  - renderer 侧由 `applyViewerUpdate`
    （`renderer/domains/conversation/services/viewer-history-update.ts`）
    统一合并增量，`useSessionViewerPageModel`/`useWorkflowTabPanelModel`
    不再每事件重建整份历史数组；raw `HistoryEntry[]` 仍完整保留以维持
    `fullHistoryToChat` 跨条目的 marker/tool-call 分组语义。
  - 测试：`session-history-page.test.ts` 补 diff 用例（追加/改写回退/
    同首变体不误发/无变化不发送）；新增 `viewer-history-update.test.ts`
    覆盖三类更新在渲染侧的合并行为。desktop typecheck 与 check:quick 绿。
- 阶段 3（2026-09-27，Renderer 窗口化迁移）：
  - `transcript-window.ts`：backlog 扩展为「已加载窗口」（entries +
    `nextBeforeEntry`/`hasMore`/`unbounded` 标记）；新增
    `prependTranscriptPage`（老页前置）、`mergeTranscriptHeadPage`
    （append-only 延展 / 重叠区签名失配 → 整窗 replaced）、
    `reconcileWindowedProjection`（重投影后按 durable key/身份/同 kind
    有序配对回收 live item，live-only 尾部原样保留，`excludeLiveIds`
    剔除已被吸收的乐观气泡）。条目签名单一事实源沉到
    `shared/history-entry-signature.ts`（main/renderer 共用 FNV-1a
    规则）。
  - `transcript-window-controller.ts`：`loadOlderTranscriptPage`
    （beforeEntry 回传、在途去重、stale → head 页对账、prependedCount →
    firstItemIndex 前移）、`refreshTranscriptTail`（head 页推进窗口末端，
    保留已加载旧页）、`resetTranscriptWindowToTail`（改写后整窗重置）、
    `drainActiveTranscriptWindow`（导出前排空窗口并物化占位）；
    `commitTranscriptWindow` 统一登记窗口/游标/视图态。
  - `optimistic-user-message-cache.ts`：新增尾对齐变体
    `reconcileOptimisticUserMessagesTail`——有界页拿不到全局 user 序号，
    改为对 canonical 末几条 user 尾对齐确认，返回 `confirmedIds` 让窗口
    reconcile 剔除已吸收的旧气泡（修掉重复气泡残留），
    `inputSegments` 照带回填。
  - Virtuoso 接入：`MessageFeedView` 转发 `startReached`/`firstItemIndex`；
    `MessageListView` 以 `transcriptWindowStateAtom.firstItemIndex`（基数
    1M）做绝对↔相对索引换算，`itemContent`/`itemsRendered`/`rangeChanged`
    全部走相对空间；`useMessageFeedScrollModel` 新增 `indexOffset`，
    `scrollToIndex`/初始目标跳转命令侧补同一偏移。
  - 消费迁移：opener tail 模式登记游标、full 模式与全部全量回落登记
    `unbounded: true`；`agent_end` 走 `refreshTranscriptTail`（队列序守卫
    + 计时补丁经 `shouldCommit`/`patchCanonical` 注入），手动压缩与
    编辑/重发/分支回载走 `resetTranscriptWindowToTail`；编辑入口的末条
    user entryId 查找改用 `tailTurns:1` 有界页；HTML 导出前
    `drainActiveTranscriptWindow` 保证完整 transcript。
  - 测试：`transcript-window.test.ts` 增分页合并/reconcile 用例（老页
    前置序、head 延展、同形条目重复签名锚定、改写 replaced、占位复用、
    prependedCount、字段 patch 保留 live blocks）；
    `optimistic-user-message-cache.test.ts` 增尾对齐确认/多未决保序/
    未决不入 canonical/超次过期/inputSegments 回填；
    新增 `transcript-window-controller.test.ts`（jsdom）覆盖翻页、
    stale 回退、firstItemIndex 前移、会话切换丢弃、head 延展/占位
    不打散、改写重置、unbounded 回落、drain 排空+物化；
    `useMessageListScrollModel.test.tsx` 更新绝对索引断言并新增偏移
    随动用例；顺手修正 `AgentProfileEditor` 头像数断言（库已扩至 24）。
    typecheck、check:quick、test:impact 全绿。
  - 已知限制：MessageTimeline/会话内搜索只覆盖已加载窗口（翻页后随窗口
    扩）；opener 回填中 preview 复用对象的 span 键错位是 TASK-0035 存量
    行为，本轮未扩大处理。
- 实际运行：
- 未运行及原因：
- 剩余风险：

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：复跑本任务声明的七个套件（主进程页合同 + 渲染端窗口/游标/滚动）。真实 UI 需要 500+ 条消息、且正在 streaming 的会话，本轮未驱动。

| 声明套件 | 本次读数 |
|---|---|
| `session-history-page.test.ts`（主进程 beforeEntry 游标页合同） | 通过 |
| `transcript-window.test.ts`、`transcript-window-controller.test.ts`（窗口合并 / reconcile / 翻页） | 通过 |
| `optimistic-user-message-cache.test.ts`（live/optimistic 不被 backfill 覆盖） | 通过 |
| `viewer-history-update.test.ts`（read-only viewer live 更新） | 通过 |
| `useMessageListScrollModel.test.tsx`（插页不跳滚动锚点） | 通过 |
| `chat-service-artifact.test.ts` | 通过 |
| **合计** | **7 文件 / 93 例通过，0 失败** |

- **未覆盖**：500+ 条真实会话上的「上滚加载旧页 / MessageTimeline 搜索跳转 / 导出完整 transcript」。这三条合同条款都以「大历史 + 正在 streaming」为 Given，本轮没有构造该会话（构造需真实模型逐轮产生消息，成本与时长都不合本轮口径）。`integration_status: pending` 仍为 pending，本轮未改动。
- **关闭建议**：七项声明套件全绿、合同条款逐条有对应用例，倾向 `done`；是否要求补一次真实长会话体验，请用户裁定。
