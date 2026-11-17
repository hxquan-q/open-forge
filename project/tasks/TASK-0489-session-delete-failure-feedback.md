---
id: TASK-0489
type: task
status: ready
priority: P1
owner: desktop
requirement: []
source: user-request / workspace OBS-SESSION-DELETE-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0226]
related_issues: []
related_bugs: [BUG-0191, BUG-0114, BUG-0087]
execution: serial
branch: task/TASK-0489-session-delete-failure-feedback
worktree: unassigned（主检出串行，本地候选，不处理main）
base_commit: b531220514be862c9af35e5eeffcba7ad902124c
read_paths:
  - apps/desktop/src/renderer/domains/project/
  - apps/desktop/src/renderer/domains/batch-tasks/
  - apps/desktop/src/renderer/shared/hooks/
  - apps/desktop/src/shared/i18n/locales/
write_paths:
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts
  - apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.deleteSession.test.tsx
  - apps/desktop/src/renderer/domains/project/hooks/useProjectsPanelMenusModel.ts
  - apps/desktop/src/renderer/domains/project/hooks/useProjectsPanelMenusModel.test.tsx
  - apps/desktop/src/renderer/domains/project/hooks/useProjects.ts
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - project/tasks/TASK-0489-session-delete-failure-feedback.md
  - project/tasks/README.md
  - project/bugs/BUG-0191-session-delete-failure-silent-and-premature-side-effects.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.5/task-0489-session-delete-failure-feedback.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-17
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# 普通会话删除的失败反馈与副作用顺序

## 合同

- BUG-0191 / 台账OBS-SESSION-DELETE-001剩余缺口，队列第5项D2/S3，归属Open-Forge-only。不重开TASK-0226 Team底层删除（已修并实机基础验证）、不涉及项目硬删除EBUSY（AUD-PROJECT-DELETE-001另题）、不改主进程删除能力。
- 目标：
  1. 普通/批量删除分支承接Promise：主删除失败→现有错误Toast `sidebar.dialogs.deleteSessionFailedToast`+console.error上下文，保留列表/标记/活动会话/路由，可手动重试；不留unhandled rejection。
  2. 元数据清理（置顶/归档标记）从菜单确认时移到删除已确认成功之后执行。
  3. 主删除成功后仍摘行/必要导航；若scheduler记录等关联清理失败，用独立i18n key明确"会话已删除，部分关联信息未清理"，不回滚、不误报未删除。
  4. 等待期间活动会话以完成时最新状态判定，旧闭包不得清掉新会话或拉回用户。
- 保留：Team分支现有成功刷新/失败Toast合同；`useConfirmDialogModel`全局确认框合同不改（只把onConfirm回调自身变async并有内部catch）；批量任务底层引擎不改；删除成功后原有置顶清理/定时记录删除/摘行语义不变，仅调整顺序与失败承接。
- Given 确认删除普通会话，When IPC拒绝，Then一条error Toast、无unhandled rejection、目标行/标记/活动/路由保留、navigate未调用。
- Given pending期间用户切到B，When A删除成功，Then B仍活动、不被拉回；A从所有桶摘除。
- Given 主删除成功但scheduler清理拒绝，Then行已摘、提示部分完成，不显示"删除失败请重试"。
- Given 批量分支deleteBatchTask拒绝，Then不导航、不提前清标记；成功维持原batch落点。
- Given 取消确认，Then不调用任何删除或清理。
- 方案比较：删除编排集中在panel model（菜单只确认与调用），复用Team成功分支的清理时机；不引入全局异步Dialog机制、不做自动重试/撤销/跨资源事务。

## 验证与协作

- 先读desktop最近AGENTS/renderer相关README、现有panel删除/菜单Hook测试与i18n。用户可见新文案走i18n（zh/en同步），复用现有Toast模式与Team日志风格。
- 红绿：先扩展现有panel删除Hook测试取得普通拒绝红灯（失败Toast缺失/unhandled rejection/标记被清）；菜单Hook测试中"确认即清标记"的旧断言改为删除成功后清理。至少一条组合测试用真实菜单model+真实panel model+真实useProjects/useProjectActions，仅`window.vetta` IPC外部边界fake；deferred Promise控制pending，不用任意sleep。
- 必测场景：主拒绝、延迟成功、非活动目标、等待期切换、失败后重试、清理失败部分完成、批量分支、Team保护回归、取消确认。
- 定向命令：`bun ../../scripts/quality/run-vitest.mjs --run <panel删除测试> <菜单测试> <新增组合测试>`及受影响的既有panel测试文件；收尾完整`bun run check`。不自动跑impact/全量/UI verify。
- 串行：同一concern共享panel/menus写域，不并行实施后续Bug。实现子代理仅写上述源码/测试/i18n；Coordinator写Bug/Task/索引/碎片并提交，另派独立只读审查。
- 用户仅授权主仓与工作区；TEMP/TMP与隔离VETTA_HOME定向`.bugfix-validation/tmp`，日志同目录；不访问真实会话/配置，不启动dev/UI/Provider，不安装依赖，不操作main或远程Git。
- 既有全仓waiver/类型/声明头阻断不治理；若仍在，候选保持verifying/integration pending，不宣称工程完成。

## 交付

- 2026-11-17派发记录：宿主原生实现子代理两次派发（fix-delete、fix-delete-2）均在写入任何源码前因宿主侧中断退出且无交付；Coordinator核实三份生产文件无diff、无task-0489验证日志、无未回收后台任务，非产品失败。合同保持ready待后续实施，不预写通过结果。
