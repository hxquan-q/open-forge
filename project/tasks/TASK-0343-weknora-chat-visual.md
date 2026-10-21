---
id: TASK-0343
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0021
plan: null
source: REQ-0021
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: e0f0c5e33
read_paths: [apps/desktop, packages/theme-ui, packages/ui, docs/devflow]
write_paths: [apps/desktop/src/renderer/domains/weknora, apps/desktop/src/renderer/shared/lib/live-animations.ts, apps/desktop/src/renderer/styles.css, apps/desktop/src/shared/i18n, apps/desktop/DESIGN.md, docs/weknora-connector.md, .github/release-notes/v0.1.3.md, project/requirements/REQ-0021-weknora-chat-visual.md, project/tasks/TASK-0343-weknora-chat-visual.md]
exclusive_paths: [apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 智能客服页面视觉打磨

## 目标与来源

需求见 [REQ-0021](../requirements/REQ-0021-weknora-chat-visual.md)：收掉顶部留白、逐字入场、思考三点、收起动画、副标题文案。

**编号说明**：本任务原在本地按 REQ-0020/TASK-0320 记录（dev 当时空闲），2026-10-20 发现 dev 已被 `sidebar-nav-labels`（REQ-0018/TASK-0319）与 `plugin-host-blocked-navigation`（TASK-0320）占用，故整体改号为 REQ-0021/TASK-0343。同批改号：三件套打磨 REQ-0018/TASK-0319 → REQ-0020/TASK-0348（合入 dev 时顺延，原 TASK-0342 已被批次记录占用）。

**分支说明**：dev 已于 2026-10-19 合并 PR #16；本任务与视觉修复先在本地 `main` 开发，待并入最新 `origin/dev` 后开 PR（用户 2026-10-20 授权本地手术，推送待另行确认）。

## 交付记录

实现（6 个原子提交 + 测试相位 3 个 + 文档 3 个 + 留白修复 2 个 + 修复测试 1 个）：

| 提交 | 内容 |
|---|---|
| `9890be4f9` | T01 页头贴边、历史栏上移、副标题 |
| `a87a91da6` | T02 逐字入场（尾部窗口 64 字符） |
| `fc52cea74` | T03 思考三点（宿主动画引擎） |
| `9b6356525` | T04 侧栏收起动画（终态卸载） |
| `f95c489c5` / `4a9ed9c2a` | 测试相位独立用例 |
| `cc0a5a7f4` / `2e180364c` / `f2cfaf311` | 文档收尾（connector / 发布说明 / DESIGN.md） |
| `b35c3e2c0` | 删除顶部 48px 空白拖拽带（2026-10-20 用户实机反馈） |
| `b489770ab` | DESIGN.md 修订 drag-region 规则 |
| `56c55be7f` | 留白修复独立验收用例 |

## 验收

工程侧：视觉 feature 25→27 文件 181 用例、留白修复 27 文件 181 用例、tsc 0 错；OCR 审查已闭环（视觉 5 条发现无必修、留白修复 2 条 low 已修）。人工侧：实机观感待用户确认。
