---
id: TASK-0534
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 6375e7eeb
read_paths: []
write_paths:
  - apps/desktop/src/renderer/shared/components/ui/
  - .github/release-notes/fragments/v0.1.5/
  - .github/release-notes/v0.1.5.md
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 右下角提示不再被打开的弹窗遮住（上游 39f3bdc88）

## 合同

- 来源与目标：PLAN-0032 基线外增量——手工合并上游 `39f3bdc88`「右下角提示不再被打开的弹窗遮住」。本地 `Toaster.tsx` 与上游修复前形态一致（直接渲染 `ToasterView`，仅 import 走 barrel 的本地分叉）：提示挂在 AppFrame 的层叠上下文里，弹窗（portal 到 body）的模糊遮罩总盖在它上面，用户在弹窗里操作时看不到报错原因（如启用服务商时 API Key 校验失败）。
- 做（本任务）：
  - `apps/desktop/src/renderer/shared/components/ui/Toaster.tsx`：改为 `createPortal(<ToasterView …/>, document.body)`，注释说明层叠上下文原因；保留本地 barrel import 分叉。
  - 新增 `Toaster.test.tsx`：移植上游用例——断言提示渲染到 document.body 而非 isolate 容器内（值断言，无调用类断言）。
  - release fragment 一份。
- 不做：ToasterView 内部样式与 z-index 层级不动；其他 overlay 的 portal 现状不动。
- Given / When / Then：
  - 弹窗打开时触发报错提示 → 提示显示在弹窗遮罩之上，用户能看清原因。
  - 无弹窗时提示行为不变。
- 验证：桌面定向 vitest `Toaster.test.tsx`；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：无独立实机验收要求（portal 行为由 jsdom 测试覆盖容器归属）。

## 交付

- 状态：2026-11-27 完成实施与工程验证，转 verifying 待用户验收。
- 工程验证（全部实际执行）：
  - 桌面定向 vitest `Toaster.test.tsx` 1/1 通过；`bun run test:impact --` 改动源文件 13 个测试文件 79 用例全部通过。
  - `bun run check` exit 0（types/lint/guards 全绿）；`check:quick`、release-notes `--check` 通过。
  - 独立 verifier 复查 verdict pass：修复忠实上游且对因（AppFrame isolate 层叠上下文）、无副作用回归（pointer-events/拖拽区/字体继承/aria-hidden 逐项实测）、断言纪律合规。
- 未运行项：Chromium 实机渲染验证（合同已声明无独立实机验收要求；遮挡修复由 CSS 层级静态推理 + jsdom 容器归属测试支撑）。
- 风险与说明：Radix 模态期间 toast 无 aria-live 属既有状态非本次新增；保留本地 barrel import 分叉。
