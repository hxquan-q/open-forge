---
id: TASK-0362
type: task
status: verifying
priority: P1
owner: desktop
requirement:
plan:
source: BUG-0144
related_requirement: []
related_plan: []
related_tasks: [TASK-0072]
related_issues: []
related_bugs: [BUG-0144]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree；用户正在此目录跑 dev）
base_commit: 3576afb39c3c3b76c4f9687dee0f2491172da249
read_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts
  - apps/desktop/src/renderer/domains/activity-panel/components/activity-panel/ActivityTabSurface.tsx
  - apps/desktop/src/main/browser-automation/browser-view-host.ts
  - packages/theme-ui/src/layout/SidebarDock.tsx
  - apps/desktop/src/shared/browser-view-ipc.ts
write_paths:
  - apps/desktop/src/shared/browser-view-bounds.ts
  - apps/desktop/src/shared/browser-view-bounds.test.ts
  - apps/desktop/src/renderer/domains/activity-panel/services/browser-view-layout.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.test.tsx
  - apps/desktop/src/main/browser-automation/browser-view-host.ts
  - apps/desktop/src/main/browser-automation/browser-view-host.test.ts
  - project/bugs/BUG-0144-browser-view-bounds-desync.md
  - project/bugs/README.md
  - project/tasks/TASK-0362-browser-view-bounds-follow-layout.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts
  - apps/desktop/src/main/browser-automation/browser-view-host.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 内置浏览器占位洞平移后原生视图跟着走

## 目标

左栏收起/展开、活动页签隐藏后再显示时，内置浏览器的原生页面仍落在占位洞里，不盖住相邻界面，也不被 0 尺寸压扁。开发态对同一地址的重复挂载不再打断正在进行的加载。

## 范围

### 并发评估

- 结论：不支持与其他写入并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`useBrowserPanelModel.ts`、`browser-view-host.ts`
- Branch：main
- Worktree：不拆。用户正在当前工作区跑 dev，修复要落在这个目录才能热更新。
- 集成负责人：当前会话
- 集成顺序：本任务单独提交，不夹带 TASK-0360 已有改动

### 做

- 占位洞的尺寸或位置变化（含祖先布局把洞平移、页签从隐藏恢复）都重新上报 bounds。
- 宽或高不是正数时不调用 `setBounds`，保留上一次有效矩形。
- 同一 URL 已在加载时，attach / navigate 不再发第二次 `loadURL`。

### 不做

- 不改浏览器工具栏、点选、实时编辑或客页脚本。
- 不改左栏动画和活动面板宽度策略。
- 不运行 `verify:ui:*`（本任务未授权实机 UI 流程）。
- 不修改 TASK-0360 的未提交内容。

## Given / When / Then

- Given：浏览器占位洞在 x=240、宽高不变。
- When：左栏收起，祖先布局把洞平移到 x=8，占位元素自身的尺寸观察器没有通知。
- Then：宿主收到 bounds.x=8，原生视图跟着洞走。

- Given：页签被隐藏，占位洞测得 0×0。
- When：布局通知到达。
- Then：不上报 0 尺寸；重新显示并测得新位置后上报该位置。

- Given：某 URL 的 `loadURL` 尚未完成，`getURL()` 仍是 `about:blank`。
- When：再次 attach 同一 URL。
- Then：只保留第一次加载。

## 必须保持

- 已有页面的 attach 不因为重复上报同一 bounds 而再次导航。
- `ERR_ABORTED` 仍不算加载失败。
- 隐藏页签挂载时原生视图保持不可见。
- 拖拽期指针穿透仍把视图暂时隐去。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/shared/browser-view-bounds.test.ts apps/desktop/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.test.tsx apps/desktop/src/main/browser-automation/browser-view-host.test.ts`
- 用户流程：上面三条 Given / When / Then，由组件测试和宿主测试覆盖。实机左栏切换不在本次运行。
- 质量检查：定向测试通过后 `bun run test:impact` 覆盖上述文件，再 `bun run check`。

## 验收分层

- 工程验证：定向 33 例通过。完整 check 未跑。影响测试里有一条既有的远程文件协议失败，不是这次改动。
- 技术评审：自审；独立评审未执行。
- 集成：pending；未提交。
- 人工功能验收：接受。用户确认侧栏切换与缩小窗口后浏览器区域对齐可用。元素点选不在本任务。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：重启 Desktop dev（主进程 bounds 守卫与在途加载去重不随 Vite 热更新生效）。打开一个会话，在活动面板的浏览器里打开本地页面。
- 操作步骤或 AI 任务输入：收起左栏，再展开；切到别的活动页签再切回浏览器；在开发态重新打开同一地址。
- 预期行为与最终产物：页面始终铺满浏览器洞，不盖住对话或左栏；切回后不是空白；同一地址不会被第二次加载打断。
- 不通过表现与已知限制：洞是空的、页面盖在对话上、或右栏被压成一条竖字，都算不通过。客页自身在正确宽度下的换行不在本任务范围。
- 验收反馈及回归案例：尚未验收。

## 交付记录

- 实际修改：占位洞跟着祖先布局和页签显隐重报 bounds；连续缩放只提交最后一次矩形；活动面板外壳宽度不再做 0.2s 过渡；0 尺寸不再写入原生视图；同一地址在途加载不第二次 `loadURL`。
- 实际运行：desktop 定向 34 例通过（含连续缩小只保留最后宽度）；theme-ui 外壳宽度 1 例通过。此前 `test:impact` 有一条无关的远程文件协议失败。
- 未运行及原因：完整 `bun run check` 未跑。未跑 `verify:ui:*`。用户继续实机看窗口缩放。
- Worktree：未拆。改动在当前工作区，方便正在跑的 dev 接上。
- 剩余风险：主进程的 0 尺寸守卫和在途加载去重要重启 dev 才生效；渲染进程的位置跟随可热更新。客页在正确宽度下自己的换行不在本次范围。
