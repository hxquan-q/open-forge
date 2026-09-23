---
id: TASK-0041
type: task
status: ready
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
integration_status: pending
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
- 实际运行：
- 未运行及原因：
- 剩余风险：
