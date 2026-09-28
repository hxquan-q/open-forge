---
id: TASK-0101
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0011（desktop-cc-gui footprint 计费机制）/ TASK-0034 / RESEARCH-0003 B-1
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/renderer/shared/store]
write_paths: [apps/desktop/src/renderer/domains/conversation, project/tasks, .github/release-notes]
exclusive_paths: [.github/release-notes/v0.1.1.md]
depends_on: [TASK-0035]
conflicts_with: [TASK-0050, TASK-0051, TASK-0038]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# transcript 恢复源 backlog 按字节预算驱逐

## 目标

TASK-0035 之后 `chatMessagesAtom` 在视口外只驻留轻量占位，但恢复源 `TranscriptBacklog.entries` 仍持有整份 `HistoryEntry[]`，内存账只是从投影对象挪到原始 entries，仍是 O(全量历史)。本步给 backlog 注册表加上限明确的字节预算：按驻留 footprint（序列化大小，tool args/results、text、thinking、usage 全计入）而非条目数或可见文本计费，超预算时驱逐最旧的非活跃会话 backlog。对应 ccgui `PARSED_CACHE` 128MB 字节预算机制（`RESEARCH-0011` B7）。

## 范围

### 并发评估

- 结论：不支持并发；与 TASK-0050、TASK-0051、TASK-0038 同属 transcript 顺序链，共享 `transcript-window.ts` 写路径。
- 执行方式：主工作区 `main` 串行。
- 可并行 Task：无（本链内）。
- 前置依赖：TASK-0035 占位与 backlog 注册表已落地。
- 冲突文件/独占路径：`services/transcript-window.ts`、`transcript-window.test.ts`；release notes 按提交独占。
- Branch：`main`。
- Worktree：共享工作区串行，不建独立 Worktree。
- 集成负责人：主会话。
- 集成顺序：本任务可先于 TASK-0050 落地（不依赖游标）；TASK-0050 后续把 backlog 演进为页粒度缓存时继承本计费口径。

### 做

- 新增 `measureHistoryEntryFootprint(entry)`：按 `JSON.stringify(entry)` 长度 × UTF-16 双字节估算驻留大小，一条 entry 的 message content（tool args/results、text、thinking、usage）全部计入，不只算可见文本。
- `backlogs` 注册表为每个 session 记录字节数；`registerTranscriptBacklog` 在原有"最多 2 个 session"计数上限之外追加字节预算（默认 128MB），任一超限即按 LRU 驱逐最旧 backlog。
- 驱逐保底：永不驱逐仅剩的最后一份 backlog（最近注册 = 活跃会话的恢复源）；被逐的非活跃会话切回时经 canonical backfill 重新注册，恢复能力不丢。
- `registerTranscriptBacklog` 接受可选 `byteBudget` 覆盖（宿主调优与测试注入）。

### 不做

- 不做页粒度驱逐与游标取页恢复（TASK-0050：backlog 演进为"已加载页缓存"、离视口最远的页先逐）。
- 不改 `chatMessagesAtom`、占位 ViewModel、`materializeTranscriptItem` 同步恢复语义。
- 不改 Main 侧历史解析与 `file-conversation-repository` 缓存（Main 全量解析属 TASK-0050 的已知上限）。
- 不改 JSONL 持久化格式，不新增索引。

## Given / When / Then

- Given：用户在多个长会话间切换，单个会话的 HistoryEntry 恢复源可达数十 MB。
- When：注册新会话 backlog 使总驻留超过字节预算或计数上限。
- Then：最旧的非活跃会话 backlog 被驱逐，活跃会话恢复源始终保留；切回被逐会话时 backlog 经正常 backfill 重新注册，占位照常恢复；未超预算时行为与现状一致。

## 必须保持

- `TranscriptBacklog` 公开形状不变（entries/spans/mediaSessionId），`readTranscriptBacklog`/`clearTranscriptBacklog` 语义不变。
- 驱逐不破坏恢复合同：活跃会话 backlog 永不因预算被逐；被逐会话重新打开后恢复链路完整。
- 计数上限（2 个会话）行为不变；字节预算是追加约束不是替代。
- 计费只在注册时发生一次（entries 不可变），不在滚动/恢复热路径上重复测量。

## 测试与验证

- 定向：`measureHistoryEntryFootprint` 对 toolResult 重型 entry 与轻量 entry 按真实 payload 计费；超字节预算驱逐 LRU 非活跃会话；仅剩一份时即使超预算也不驱逐；同 key 重复注册不重复计费；被逐会话重新注册后 `materializeTranscriptItem` 照常恢复。
- 用户流程：打开长会话 → 切换到另一长会话 → 旧会话 backlog 被逐出预算外 → 切回旧会话 → 占位恢复与滚动行为不变（由既有 session-switch 测试与本任务新增的"驱逐后重注册恢复"用例覆盖）。
- 质量：`bun scripts/quality/run-vitest.mjs --run <test-file>`、`bun run test:impact -- <改动文件>`、`bun run check:quick -- <改动文件>`；补当前版本 Release Notes。

## 交付记录

- 实际修改：
  - `services/transcript-window.ts`：`backlogs` 注册表内部记录每会话字节数；新增 `measureHistoryEntryFootprint`（`JSON.stringify(entry).length * 2` 按驻留计费，tool args/results、text、thinking、usage 全计入）与 `TRANSCRIPT_BACKLOG_BYTE_BUDGET`（默认 128MB）；`registerTranscriptBacklog` 在计数上限（2）之外追加字节预算，超限按 LRU 驱逐最旧 backlog，保底不逐仅剩一份（活跃会话恢复源）；新增 `byteBudget` 可选覆盖。`TranscriptBacklog` 公开形状与 `readTranscriptBacklog`/`clearTranscriptBacklog` 签名不变。
  - `transcript-window.test.ts`：新增 5 例——toolResult 重型 entry 计费、超预算驱逐 LRU 非活跃会话、单份保底、同 key 重注册不重复计费（注入第二会话使字节泄漏可被断言）、被逐会话重注册后占位照常恢复。
- 实际运行：
  - `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/conversation/services/transcript-window.test.ts`：19/19 绿（14 旧 + 5 新）。
  - `bun run check:quick -- <2 个改动文件>`：Biome + 全部架构守卫通过。
  - `useSessionManager.session-switch` 9、`queue`+`cross-session-leak`+`stale-instance-send` 11 单独重跑全绿。
- 未运行及原因：
  - `bun run test:impact` 首轮在高负载（dev 实例 + 24 包 turbo 构建并行）下 17 个 `useSessionManager.*` 超时失败，与改动无关——同文件单独重跑全部通过；未做 `bun run check` 全量（工作区有其他 Agent 在途改动）。
  - `privateBytes` A/B 实测未做：按 TASK-0035 决定随 TASK-0050 元数据窗口化一起做端到端测量，避免重复埋点。
- Worktree：未拆出（主工作区串行，单文件改动面）。
- 剩余风险：
  - 单会话恢复源自身超过 128MB 时无法被逐（保底规则），该会话驻留仍 O(全量)；根治靠 TASK-0050 的页粒度缓存。
  - `JSON.stringify` 计费在注册时跑一次，超长会话每次 canonical backfill 增加一次 O(history) 序列化；该成本与同路径上已有的全量投影同阶，未实测其对超大会话打开耗时的影响。
  - 驱逐粒度是会话级；页粒度"离视口最远先逐"与游标取页恢复属 TASK-0050，届时本计费口径原样继承。
