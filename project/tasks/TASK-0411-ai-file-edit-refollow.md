---
id: TASK-0411
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
plan: PLAN-0026
source: BUG-0155（TASK-0407 报告 F04）
related_requirement: [REQ-0030]
related_plan: [PLAN-0026]
related_tasks: [TASK-0407, TASK-0392]
related_issues: []
related_bugs: [BUG-0155]
execution: serial
branch: unassigned（主检出 chenxvhua 串行）
worktree: unassigned（不拆 worktree）
base_commit: defd1a2fa
read_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/shared/store/file-preview-atoms.ts
write_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.test.ts
  - project/tasks/TASK-0411-ai-file-edit-refollow.md
  - project/tasks/README.md
  - project/bugs/BUG-0155-ai-file-edit-refollow.md
  - project/bugs/README.md
  - project/plans/PLAN-0026-code-mode-audit-repairs.md
  - .github/release-notes/fragments/v0.1.4/bug-0155-ai-file-edit-refollow.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 同一 AI 文件再次编辑跟回内嵌预览（BUG-0155）

## 目标

跟随判定改为「新 AI 活动（目标对象变化）且当前实际预览不是该文件」：AI→A、用户看 B、AI 再编辑 A 时预览跟回 A；用户手动浏览不被旧目标回拉；预览已在该文件时不重置。

## 范围

### 并发评估

- 结论：不支持并行；PLAN-0026 第 4 片，主检出串行。
- 执行方式：serial。
- 冲突文件/独占路径：`useFollowAiFileEdits.ts` 独占；与后续 §11.3/F03 切片共享文件但串行。
- Branch：主检出 chenxvhua。Worktree：不拆。集成顺序：PLAN-0026 第 4 片。

### 做

1. 去重改双条件：`lastTargetRef`（目标对象）+ 当前 `inlineFilePreviewAtom` 读值与目标路径比较；与 TASK-0392 页签跟随同构。
2. 回归：跟回场景红→绿；手动浏览不被回拉；已看目标不重置。

### 不做

- 不做编辑活动的会话/workspace 身份（F03 切片）；
- 不改页签级跟随与 aiEditTarget 生产端。

## Given / When / Then

- Given 预览在 B、AI 再次编辑 A，Then 预览切回 A。
- Given 预览被用户切到 B、无新 AI 活动，Then 预览保持 B。
- Given 预览已是 A、AI 连续编辑 A，Then 不重置上下文。

## 必须保持

- 换目标即切换、无目标不写预览的既有合同；
- 预览写入仍是单项上下文（既有形态）；
- 页签级跟随行为不变。

## 测试与验证

- 定向：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/activity-panel/hooks/useFollowAiFileEdits.test.ts`（apps/desktop 内）。
- 相邻：useFollowAiActivity.test.tsx。
- `bun run check:quick`；完整 check 留批次收尾。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待用户实机（可选）。发布：未授权。

## 功能验收包

- 入口：code 会话右栏文件页签；触发 AI 编辑→手动切文件→再触发同文件编辑。
- 预期：预览跟回被编辑文件。不通过表现：停留用户所选文件。

## 交付记录

- 实际修改：`useFollowAiFileEdits.ts`（双条件去重：目标对象引用 + 当前预览路径比较；注释同步）；`useFollowAiFileEdits.test.ts`（跟回、不回拉、不重置三个用例）；BUG-0155/本 Task/索引与 v0.1.4 fragment。
- 实际运行：定向红 1→绿（4/4）；相邻 `useFollowAiActivity.test.tsx` 4/4；`check:quick` 通过。
- 未运行及原因：完整 check 与 impact 留批次收尾；实机走查可选人工验收。
- Worktree：未拆出（主检出串行）。
- 剩余风险：无已知；跨项目旧目标消费（F03）不在本片。
