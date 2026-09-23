---
id: TASK-0050
type: task
status: draft
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
updated: 2026-09-23
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

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
