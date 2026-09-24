---
id: TASK-0106
type: task
status: ready
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0010
source: RESEARCH-0013 M5（VS Code `textModel.ts` 大文件硬闸：20MB/300k 行/256MB 一次性判定降级）
related_requirement: [REQ-0002]
related_plan: [PLAN-0010, PLAN-0002]
related_tasks: [TASK-0035, TASK-0050]
related_issues: [ISSUE-0020]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/renderer/domains/activity-panel/, apps/desktop/src/renderer/domains/file-explorer/, apps/desktop/src/main/conversations/]
write_paths: [apps/desktop/src/renderer/domains/, apps/desktop/src/main/conversations/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0050, TASK-0051, TASK-0038, TASK-0115]
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 大尺寸对象功能降级硬闸

## 目标

VS Code 在模型创建时按尺寸阈值一次性判定并关闭高耗功能（`_MODEL_SYNC_LIMIT=50MB`、`LARGE_FILE_*` 阈值，`textModel.ts:188-191,338-368`）——**宁降级不炸**。Open Forge 有工具结果大小策略（RESEARCH-0003 A 表），但没有「对象级尺寸 → 功能降级」开关：长 transcript 全量 hydration、大 artifact 预览高亮、大文本文件预览都是潜在最坏路径。本任务建立统一的「尺寸阈值 → 降级」判定，先防最坏路径。

## 范围

### 并发评估

- 结论：不支持并发——写路径与 transcript 窗口化链（TASK-0050/0051/0038，均为 draft/在途）及 TASK-0115（会话监视器读取会话状态）重叠。
- 执行方式：serial，主工作区；需排在 transcript 链当前在途项之后或协调窗口期执行。
- 可并行 Task：PLAN-0011 治理任务、TASK-0103/0104/0109。
- 前置依赖：建议等 `TASK-0050`（游标分页）落地后做，避免同一投影面双向改。
- 冲突文件/独占路径：`transcript-window.ts`、`ChatTimelineItem` 投影、artifact 预览组件。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：Coordinator。
- 集成顺序：transcript 链在途项收口后。

### 做

- 定义对象尺寸阈值表（如：transcript 总字节、单条消息字节、artifact 字节、文本文件行数/字节）——阈值语义与 RESEARCH-0003 B-1 窗口化共用同一口径；
- 命中阈值时的降级动作按对象类型定：transcript 走既有窗口化/占位路径（不重复造）；artifact 预览关语法高亮/关虚拟滚动外渲染改纯文本；文件编辑器预览关 tokenization/搜索索引；
- 判定一次性、不可逆（对齐 VS Code：内容缩小不重开），并在 UI 给明确降级提示（i18n 文案）；
- 降级判定函数抽纯逻辑，可单测。

### 不做

- 不做「渐进式降级」（如部分 tokenization）——一次性判定，避免状态机复杂化；
- 不改 transcript 窗口化本身的语义（那是 PLAN-0002 链的事）；
- 不影响持久化数据——降级只影响渲染/处理，不改写数据。

## Given / When / Then

- Given：一个超阈值的长会话/大 artifact/大文本文件；
- When：对应视图/投影初始化；
- Then：按阈值表关闭指定高耗功能，界面给出降级提示而非卡死或 OOM；`privateKb` 曲线在降级前后可对比（记入交付）。

## 必须保持

- 数据完整性：降级不丢数据，用户始终能看到「内容过大已降级」提示并可选择查看原始内容；
- 降级判定必须在渲染/索引启动**之前**生效；
- i18n：所有降级提示文案走 catalog，不硬编码。

## 测试与验证

- 定向测试：阈值判定纯函数单测（边界值、不可逆性）；各对象类型降级路径组件测试；
- 用户流程：构造超阈值会话/文件，打开对应视图验证降级生效与提示文案；
- 质量检查：`bun run check:quick`、`test:impact` 相关包、`privateKb` 对比记录。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- Worktree：
- 剩余风险：
