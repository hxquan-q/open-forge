---
id: TASK-0034
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-1
execution: coordination-only
branch: forge/dev
worktree: unassigned（设计定稿，不创建代码 worktree）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store, apps/desktop/src/main/ipc/session.ts, apps/desktop/src/preload/api-types/session.ts, apps/desktop/src/preload/apis/session.ts, packages/runtime-core/src/contracts.ts]
write_paths: [project/tasks, .github/release-notes]
exclusive_paths: [.github/release-notes/v0.5.59.md]
depends_on: [TASK-0031]
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 渲染端 transcript 窗口化合同定稿

## 目标

冻结渲染端 transcript 的显示窗口、向上分页和 compaction 边界语义；将实现拆成可顺序验证、独立回滚的 Task。JSONL 继续作为唯一持久化事实源，本合同只约束 Desktop 的 IPC 与 Renderer 投影。

## 当前事实

- `apps/desktop/src/renderer/shared/store/chat-atoms.ts:186` 的 `chatMessagesAtom` 持有当前会话的完整 `ChatConversationItem[]`；`MessageListView.tsx:198-219` 用 Virtuoso 裁 DOM，不裁数据对象。
- `useSessionOpener.ts:284-300` 先经 `openViewer({ tailTurns: 2 })` 呈现尾部；`:528-529` 随后无参数调用 `getFullHistory`，`:620-654` 再以全量 canonical 历史替换预览并保留并发产生的 optimistic 消息。
- 主进程 `session.ts:1177-1179` 将 `getFullHistory` 原样转发给 Runtime；`:1731-1743` 的 `openViewer` 支持 `tailTurns`，当前没有游标或页大小。
- Preload `api-types/session.ts:230,285-295` 同样只暴露全量历史和全量 viewer 快照；viewer 订阅会在文件变化时重复发整份历史。
- 整表回填还发生于 `useSessionEventController.ts:274-303,525-535`、`useSessionMessageSender.ts:307-309`、`useUserMessageActions.ts:106-111,182-190,243-244`。`preserveMessagesAddedAfterSnapshot` (`chat-message-snapshot.ts:55-63`) 以 ID 差集保留快照之后的 Renderer-only 行。
- `MessageTimeline`/`messageNavigationModel` 从全数组生成摘要、目录和本地全文搜索；`MessageListView` 聚合 usage、model-switch、plugin-card 等展示数据；这些不是消息存储事实源。

## 窗口与分页合同

### IPC 页面

- 新增统一的 `HistoryPageRequest`：`{ limit?: number; beforeEntry?: string; tailTurns?: number }`。`beforeEntry` 是不透明游标，只能原样传回由上一页返回的 `nextBeforeEntry`，调用方不得自行构造。
- `limit` 默认 `100`，合法范围 `1..200`。每页按 history entry 数量计数，页内及连续向上拼接均保持原始 history 顺序（旧 → 新）；`beforeEntry` 是排他边界，连续页不得重复或漏项。
- 响应为 `{ history: HistoryEntry[]; hasMore: boolean; nextBeforeEntry: string | null }`。到历史起点时 `history` 可为空，且必须 `hasMore: false`、`nextBeforeEntry: null`；无效或因分支改写而失效的游标返回明确的 `HISTORY_CURSOR_STALE` 错误，不伪装成空页，Renderer 丢弃旧游标并重新取最新页。
- `getFullHistory(sessionId)` 无参数仍返回既有完整数组，保留旧调用兼容；传入分页请求时返回 `HistoryPage`。`openViewer(path)` 无参数仍返回既有完整快照；传入请求时返回有界页。新旧调用都沿用现有 `history` 字段，分页元数据为新增字段。
- `tailTurns` 只允许用于第一页，保留现有 `1..10` 校验与“从最近 N 个完整 user turn 起选尾部”的含义；其结果仍受 `limit` 上限约束，若最老选中回合跨页，`nextBeforeEntry` 可继续取得剩余前缀。`tailTurns` 与 `beforeEntry` 同时出现视为参数错误。
- 传入任一 `HistoryPageRequest`（包括只含 `tailTurns` 的 options）即进入分页模式；默认 limit 为 100，只有完全不传 options 才维持 legacy 全量语义。所有 UI 历史回填必须迁到显式分页模式；仅导出等明确全文操作可使用隔离的逐页 drain，不得把全文结果写回 `chatMessagesAtom`。
- 游标定位于发页时的稳定历史前缀：之后 append 的新消息不进入已开始的向上分页序列，由 live event 单独追加；若分支/删除等改写导致游标不可定位，按 stale 错误重新开始。JSONL 不新增 ordinal 索引，也不持有服务端分页会话状态。
- `subscribeViewer` 增加可选分页请求。无请求保持旧全量快照行为；分页订阅只发送新增 history delta，检测到非追加改写时发送有界最新页并标记 reset。订阅仍必须可取消，关闭/切会话后不再保留回调或游标。

### Renderer 占位与恢复

- 每条视口外消息保留同一稳定 `id`/render key、`role`/kind、时间、`entryId`、分支导航元数据、有限文本摘要（最多 120 Unicode 字符）及轻量 usage/model 摘要；不得保留完整 `blocks`、完整 `text`、tool args/results、thinking 或媒体字节/`data:`。
- 仅消息内容转换为占位；compaction/error 等本来就是轻量的时间线事实继续留在原位。占位使用独立的 Renderer ViewModel 联合类型，不伪装成完整 `ChatConversationItem`，避免下游误读空 blocks 为真实空消息。
- 消息进入 MessageList 当前虚拟化 overscan 窗口（上方 320px、下方 80px）时按 `id` 恢复完整消息；离开该窗口后可降回占位。用户对占位发起复制、展开或需要完整内容的操作时先恢复该条；流式尾项、焦点/选区中的条目及正在交互的卡片暂不回收。
- 恢复须复用稳定 key 并保持列表顺序、已测量高度、滚动锚点和媒体引用语义；`src` 引用与旧会话 `data:` 回退均不变。占位只减少重型内容驻留，第一步仍允许轻量元数据按全历史 O(n) 保留。

## 全量消费方归属

| 消费方 | 合同与后续归属 |
| --- | --- |
| 打开/切换、agent_end、手动 compaction、编辑/重发、删改/分支回载 | TASK-0050 使用尾页/游标页合并当前窗口；`preserveMessagesAddedAfterSnapshot` 仅保留快照之后的未持久化行，按稳定 ID 去重，不把旧页替换成全量数组。 |
| MessageTimeline 目录/本地全文搜索、消息导航、fork 来源、model-switch 与 usage 汇总、plugin card 归属 | TASK-0035 占位提供必要摘要；全文搜索按页扫描并只保留命中项，目录跳转按游标加载目标页；轻量 usage/branch/model 元数据随占位保留，完整 plugin card 只从已恢复消息构建。 |
| 侧栏跨会话搜索 | 现有 `desktop-session-search` 从会话文件/搜索服务读取，不依赖 `chatMessagesAtom`；结果打开会话后须能按目标记录定位到对应页，不把窗口化数组当搜索索引。 |
| 导出 HTML | TASK-0050 在独立导出流程按固定 snapshot 逐页读取并渲染完整 transcript；导出结果完整，但全文临时驻留不得污染活动会话 atom，完成/取消后释放页和 DOM。 |
| 消息复制 | 单条复制仍以用户所选消息为范围；目标为占位时先恢复该条。跨消息选区必须恢复实际选中的占位内容后再复制，不扩大成默认全文复制。 |
| 统计 | Turn 时长/速度继续使用 `usage.update` 与既有有界 `turnStatsCache`；消息列表 usage 聚合使用占位中保留的轻量 usage，不遍历空 blocks，也不因历史分页而重置。 |

## Compaction 边界语义

- compaction 仅改变模型上下文，不删除或改写 transcript 历史。所有先前用户可见消息仍按原顺序可定位，视口外可降为占位，并可经 JSONL 还原。
- compaction entry 的 summary/boundary 作为独立轻量时间线条目保留在原位置；不得用摘要替换或覆盖原消息，也不得将摘要伪装成用户/assistant 正常消息。
- 成功 compaction 后可回收非窗口内消息 blocks，并从同一持久化 history 重新构建当前可见窗口；保持用户当前滚动锚点，随后可向前加载并还原压缩边界之前的记录。
- 失败/取消的 compaction 不改变历史窗口或游标。compaction 事件触发、thrash 检测、失败熔断及溢出尺寸种子属于 TASK-0038，不在本合同的边界重放实现中。

## 后续 Task DAG

```text
TASK-0031 done
    ↓
TASK-0034 done（本合同）
    ↓
TASK-0035 ready：视口外元数据占位与按视口恢复
    ↓
TASK-0050 draft：beforeEntry 游标分页、viewer live delta、全文消费方适配
    ↓
TASK-0051 draft：compaction 边界保留与窗口重放
    ↓
TASK-0038 draft：compaction 事件联动与防抖，不重复实现边界重放
```

这条链不能直接并发：0035、0050、0051、0038 共享 conversation/store 与 compaction 渲染接线；采用 `forge/dev` 共享工作区串行，按上图集成。TASK-0036/0037/0040/0041 不属于此链，只有在各自 `write_paths` 与 release-note 独占路径无冲突时才可另行并行。

## Given / When / Then

- Given：长会话已打开，首屏只持有尾部页，用户已有滚动位置和可能尚未落盘的 optimistic 消息。
- When：向上浏览并加载旧页、搜索命中跳转、导出或发生成功/失败 compaction。
- Then：连续页无重漏，活动窗口外不驻留完整 blocks，摘要/usage/导航结果稳定；全文操作可完整读取但不扩大活动 atom；compaction 前后的已发消息始终可见、可恢复，JSONL 与持久化格式不变。

## 验收标准

- IPC/preload 类型明确表达 legacy 全量路径与分页路径，旧 `openViewer({ tailTurns })` 和无参数调用保持兼容。
- 三个独立实现 Task 均引用本合同、边界/消费者归属和测试路径明确；TASK-0038 不再拥有边界重放语义。
- 每步至少覆盖连续操作流程及其竞态/失败边界；性能验证固定长会话输入，对比 Renderer privateBytes 峰值/稳态与切会话回落，不以 DOM 虚拟化作为内存证明。

## 测试与验证

- 本任务为 coordination-only，不改运行时代码、不新增运行时测试。
- 验收检查：后续 Task 的依赖顺序、consumer ownership、Given/When/Then 和测试命令完整；Release Notes 记录本次内部合同定稿。

## 交付记录

- 实际修改：冻结本合同；更新 TASK-0035、TASK-0038；新增 TASK-0050、TASK-0051；更新 Task 索引和当前版本内部 Release Notes。
- 实际运行：`git diff --check` 通过；复核了工作区状态及目标合同、索引和 Release Notes 差异。
- 未运行及原因：不运行代码测试；本 Task 不改代码。
- 剩余风险：无 ordinal 二级索引，分页服务端初期可能仍需扫描/裁剪现有完整 Runtime history；这里只保证传输和 Renderer 驻留有界，不承诺 Main 解析 O(window)。
