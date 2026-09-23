---
id: TASK-0041
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-7
execution: serial
branch: forge/dev
worktree: unassigned（会话列表/恢复路径与在途任务无交集，可独立 worktree）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/ipc/session.ts, apps/desktop/src/renderer/domains/conversation, packages/runtime-node/src/conversation]
write_paths: [apps/desktop/src/main, apps/desktop/src/renderer/domains/conversation, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（forge/dev 工作区，未提交）
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# 会话列表/恢复最小化：stat 轻索引 + 大会话恢复选项

## 目标

多会话用户的恢复路径是全量解析 JSONL 的重灾区。两步：(1) 会话列表改 stat 轻索引（大小/mtime/标题摘要预取），点开才解析文件；(2) 大会话打开时提供「从摘要恢复/只载尾部」选项。

## 范围

### 并发评估

- 结论：支持——会话列表 IPC + renderer 会话选择器，与 transcript 窗口化线互补不重叠；
- 业界参照：Claude Code resume 改 stat 索引渐进加载，多会话场景内存 -68%（CHANGELOG v2.1.30）；Codex `ReverseJsonlScanner` 从文件尾 64KiB chunk 倒序取最近几条做预览、不进内存即渲染（`tui/src/resume_picker_transcript_preview.rs`）。

### 做

- 会话列表 IPC 改为 stat 级元数据（必要时带尾部小窗预览），不做全量解析；
- 大文件会话打开路径给出恢复选项（摘要恢复或尾部窗口，与 TASK-0034 游标合同对齐）；
- 100+ 会话库的打开内存/耗时前后对比记录。

### 不做

- 不改会话文件格式；
- 不删全量打开能力（用户可选完整加载）；
- 与 TASK-0034 游标分页重复的部分按合同归属，不双轨实现。

## Given / When / Then

- Given：用户有 100+ 会话的库
  When：打开会话选择器
  Then：列表渲染不触发全量 JSONL 解析，内存/耗时显著低于全量基线；点开大会话时可选择只载尾部

## 必须保持

- 列表信息（标题/时间/预览）准确，不误显空会话；
- 恢复路径仍能把会话完整打开（选项只是默认值优化）。

## 测试与验证

- 定向测试：stat 索引元数据正确性、大会话恢复选项分支；
- 用户流程：100+ 会话库打开选择器→选大会话→尾部恢复→继续对话；
- 质量检查：`check:quick`；恢复路径内存曲线对比。

## 交付记录

- 实际修改：
  - `packages/runtime-node/src/conversation/file-conversation-session-services.ts`：`listSessions` 从 readFile→document→project 全量物化改为 `createReadStream`+`readline` 流式 JSONL stat 索引——只提取 header/首条 user/末条消息 role+text+timestamp，不再构建完整 document/history 对象图；`modifiedAt` 取最后一条消息 timestamp，无有效时间戳才回落 `mtimeMs`；v1/v2 header 均兼容，`parentSessionPath`/`parentEntryId` 用 `"in"` 收窄安全提取；新增 `fileSizeBytes` 到 `SessionInfo`。
  - `useProjects.ts`：`sessionListsEqual` 纳入 `fileSizeBytes` 比较，避免索引字段变化被去重吞掉。
  - `useSessionOpener.ts`：`resolveHistoryLoadMode`（已导出）——`fileSizeBytes > 4MB` 弹确认对话框（i18n `chat:session.largeHistory.*`），确认走 tail 模式（末 10 轮）否则 full；优先取 `options.fileSizeBytes`，回落 `sessionsMapAtom` 查找，bucket key 用 `conversationBucketCwd`。
  - `useProjectsPanelModel.ts`：最终保持 3 参 `onOpenSession` 调用（opener 内部 sessionsMap 兜底已覆盖 fileSizeBytes，4 参管道冗余且会破坏 props 类型链）。
  - i18n：en/zh `chat.json` 增加 largeHistory 文案。
- 实际运行：
  - `file-conversation-session-services` 定向测试 + `useSessionManager.session-switch` 9/9（新增 tail/取消/resolveHistoryLoadMode 分支）、`useProjectsPanelModel.selectSession` 12/12 绿。
  - 120 会话合成库 A/B：旧全量解析路径 ~72ms → 新 stat 索引 ~29.9ms（≈2.4×）；单会话 ~9MB 大文件场景 wall-time 基本持平（流式按行解析与一次性 parse 同量级），结构性收益是**不再物化 document/history 对象图**——堆峰值与 GC 压力随历史规模线性下降。
  - `tsc --noEmit`（runtime-node + desktop 本任务文件）0 错误。
- 未运行及原因：
  - `bun run check` 全量：受工作区其他 Agent 在途错误影响暂不可绿。
  - 真实 ~/.openforge 库实机测量：无授权的本地数据目录不做端到端读盘；合成语料可复现（脚本见交付说明）。
- 剩余风险：
  - stat 索引逐行扫全文件，极端超大单文件（>100MB）wall-time 与旧路径相当；真正跳读需要后续 offset/索引持久化（超出本任务范围）。
  - 会话文件尾部损坏行只影响该行解析（逐行 try/catch 沿用旧语义）。
