---
id: TASK-0492
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-19
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0194]
execution: serial
branch: unassigned
worktree: unassigned（主工作区串行）
base_commit: 445b66ae3
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/renderer/domains/project/hooks
  - apps/desktop/src/shared/i18n/locales
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/shared/i18n/locales/zh/project.json
  - apps/desktop/src/shared/i18n/locales/en/project.json
  - .github/release-notes/fragments/v0.1.5
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# 版块会话行接入三项操作菜单（BUG-0194）

## 合同

- 来源与目标：`BUG-0194`。用户 2026-11-19 报告「点会话行尾的 ··· 直接进了会话」。目标是让 `···` 成为真实的菜单入口，且点它不再触发打开。
- 输入 → 输出：卡片与弹窗各自内联的会话行 → 抽成共用 `AllstarSessionRow`（标题按钮 + 独立 `···` 菜单）；model 增加 `onRenameSession` / `onRevealSession` / `onDeleteSession` 与 4 条 label。
- 做 / 不做：
  - 做：菜单三项（重命名 / 在文件夹中打开 / 删除）、行内重命名输入、删除二次确认、i18n 文案、模型与视图测试。
  - 不做：不接置顶与归档（代码会话不进普通侧栏列表，这两项在这里没有可见落点）；不改动侧栏既有 `SessionContextMenu`（它服务于侧栏右键，语义不同）；不修复 `BUG-0191`（普通会话删除失败的反馈问题）。
  - 并发结论：串行。改动集中在一个 domain + 两处 locale，无并行拆分收益。
- Given / When / Then：
  - Given 版块里有开发会话，When 点行尾 `···`，Then 展开三项菜单且不导航；点标题才打开会话。
- 保留：团队会话与普通会话在同一列表内一视同仁（不打标识、不分派打开逻辑，分派仍在 model）。
- 验证：`run-vitest.mjs --run AllstarDevHomePageView.test.tsx`、`useAllstarDevHomePageModel.test.tsx`；`bun run check:quick -- <改动文件>`。
- 人工验收：用户在 dev 实例点 `···` 看菜单、试一次重命名与在文件夹中打开。

## 交付

- 实际修改与验证：见「交付记录」。
- 评审与集成：自审；`integration_status` 保持 `pending`，未 push。
- 发布：`.github/release-notes/fragments/v0.1.5/bug-0194-allstar-session-row-menu.md`。

## 交付记录

2026-11-19 实施完成（base_commit `445b66ae3`）：

- 新增 `components/AllstarSessionRow.tsx`：普通容器 + 标题 `Button`（打开会话）+ 行尾 `···` `DropdownMenu`（三项）；重命名用行内 `Input`（Enter 提交 / Esc 取消 / 失焦提交，`committedRef` 防重复提交）；菜单项之间用分隔线隔开删除。
- `AllstarDevHomePageView.tsx` / `AllstarDevSessionsDialog.tsx`：两处内联行替换为共享组件，删除 `role="button"` 整行与装饰性 `···` 占位。
- `useAllstarDevHomePageModel.ts`：新增三项动作。chat 走 `session.rename` / `session.delete` + `loadSessions(cwd)` 重拉；团队会话走 `agentTeams.renameSession` / `deleteSession` + `notifyTeamSessionsChanged`；删除前弹 `confirmDialogAtom` 确认；失败弹 toast。
- i18n：新增 `allstarDev.home.sessions.actions` / `renameFailed`（zh + en），动作名复用侧栏既有 `contextMenu.rename` / `contextMenu.delete`。
- 测试：`AllstarDevHomePageView.test.tsx` 20/20（新增 2 例、改写 2 例结构断言）；`useAllstarDevHomePageModel.test.tsx` 4/4。
- 检查：`check:quick` 全绿。过程中被拦两次并已修正：① biome 导入顺序（`@shared/agent-teams` 应在 `app-shell` 前）；② DESIGN D03 拒绝手写 `<button>`，标题按钮改用共享 `Button`。

### 未运行项

- 真实浏览器目视（点 `···` 看菜单展开与定位）与真机改名/删除闭环：`verify:ui:*` 需当次授权。
- impact / 全量测试：按仓库约定由用户决定。

### 遗留

- 卡片行与弹窗行现在共用 `AllstarSessionRow`，若后续要给弹窗加「时间」列，应改这一处而非两处。
- 置顶 / 归档若日后在版块内有了承载面（例如版块自己的归档视图），再考虑补进菜单。

## 2026-11-19 修正：第二项动作的落点

用户反馈「打开的是项目目录，我还以为打开的是会话数据目录」。确认是我的语义取错：照抄了侧栏右键菜单的 `showInFolder(session.cwd)`，而版块里这一项应回答「这条会话存在哪」。

- `onRevealSession` 改为接收整条会话，定位 `session.path`（chat 为 JSONL，团队为协调会话文件），落到会话数据目录并在文件管理器中选中该文件。
- 文案改为独立的 `allstarDev.home.sessions.reveal`（zh「打开会话数据目录」/ en「Open session data folder」），与卡片级「在文件夹中打开」（项目目录）刻意区分，避免同一个说法指向两个位置。
- 测试断言同步为 `toHaveBeenCalledWith(session)`；20/20 仍绿。

## 2026-11-19 修正：新增文案键插错层级

用户截图反馈菜单第二项直接显示 `allstarDev.home.sessions.reveal`（原始 key）。

- 根因：`55e820005` 与 `c8dc223b8` 两次插入都落在 `allstarDev.home.projects.sessions.*`（`projects` 对象闭合括号之前），而代码取 `allstarDev.home.sessions.*`；i18next 取不到键时回退显示原始 key。同批受影响但当时不可见的还有 `actions`（`···` 按钮 aria-label）与 `renameFailed`（改名失败 toast）。
- 修复：`sessions` 块移到 `allstarDev.home` 下（zh + en 各一份），`home.projects.sessions` 归零。
- 为什么没被拦住（可复现证据）：`check:quick` 不含类型检查（`scripts/quality/check-quick.mjs` 里没有任何 tsc/tsgo 调用），而 i18n 键类型由 `renderer/shared/i18n/i18next.d.ts` 从 zh 资源推导，只在 `bun run check` 的 types 阶段校验。用旧 JSON 临时回灌后跑 `typecheck:incremental`，tsc 报 `TS2345 … Did you mean "allstarDev.home.projects.sessions.actions"?`，即完整 check 本来就能拦住。
- 本次交付改为跑完整门禁：`bun run check` 全绿（lint 5311 文件、types 五路 0、guards 全过、mobile-lint 通过）+ 定向测试 24/24。
