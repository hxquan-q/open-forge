---
id: TASK-0365
type: task
status: verifying
priority: P1
owner: desktop
requirement:
plan: PLAN-0006
source: BUG-0145
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0351, TASK-0360]
related_issues: []
related_bugs: [BUG-0145]
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: ebc598989032fc5d5015bf3a6eff7da946e1ca17
read_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - apps/desktop/src/main/browser-automation/webview-picker-guest.test.ts
write_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - apps/desktop/src/main/browser-automation/webview-picker-guest.test.ts
  - project/bugs/BUG-0145-browser-picker-pointerdown-swallows-click.md
  - project/bugs/README.md
  - project/tasks/TASK-0365-browser-picker-pointerdown.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-23
---
<!-- Copyright The Open Forge contributors. -->

# 点选在指针按下时打开元素旁的批注

## 目标

点选模式打开后，单击在元素旁边出现批注框，Shift 多选，Alt 把这一个元素放进对话输入框，这些点击不触发页面按钮。

## 范围

### 并发评估

- 结论：不支持与其他写入并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`webview-picker-guest.ts`
- Branch：main
- Worktree：不拆
- 集成负责人：当前会话
- 集成顺序：本任务单独提交

### 做

- 点选动作改在 `pointerdown` 完成。
- 若随后仍有 `click`，不再打开第二次。

### 不做

- 不改批注外观、多选上限和发送文案。
- 不改浏览器视图的位置跟随。

## Given / When / Then

- Given：点选模式已打开，页面上有一个按钮。
- When：只发生 `pointerdown`，Chromium 不再派发 `click`。
- Then：元素旁出现批注框，按钮自己的 click 不触发。

## 必须保持

- 只收到 `click` 的测试路径仍能打开批注。
- 批注框内部的输入和发送不被点选逻辑吞掉。
- Escape 仍取消点选。

## 测试与验证

- 定向测试：`apps/desktop` 下 `bun ../../scripts/quality/run-vitest.mjs --run src/main/browser-automation/webview-picker-guest.test.ts`
- 用户流程：打开点选，单击、Shift 再点、Alt 再点。客页脚本在主进程 bundle 里，dev 需要重启后才生效。
- 质量检查：定向测试通过后视时间跑 `check:quick`。

## 验收分层

- 工程验证：`webview-picker-guest.test.ts` 12 例通过。完整 check 未跑。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待验收。必须重启 dev。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：重启 Desktop dev。打开内置浏览器，点工具栏的点选按钮。
- 操作步骤：单击元素；按住 Shift 再点另一个；按住 Alt 再点一个。
- 预期行为：单击后输入框贴着元素；Shift 把多个元素留在同一次批注；Alt 把该元素放进对话输入框；页面按钮不被点开。
- 不通过表现：只有提示、没有输入框，或点击仍触发页面按钮。
- 验收反馈及回归案例：尚未验收。

## 交付记录

- 实际修改：点选在 pointerdown 打开批注，随后的 click 不再开第二次。
- 实际运行：`webview-picker-guest.test.ts` 13 例通过（含罩层接指针取下层元素、只有 pointerdown 无 click 两例）；`check:quick` 全绿。
- 未运行及原因：完整 `bun run check` 未跑，本提交改的是主进程注入脚本与台账，typecheck 由后续批次统一跑。本地 `main` 已提交，未推送。
- Worktree：未拆。
- 剩余风险：主进程未重启时用户仍看到旧脚本。
- 2026-10-22 真实 Desktop 验证（Fresh 隔离实例）：单击（pointerdown）在元素旁打开批注、十字光标、罩层接指针、页面按钮不触发、随后 click 不再二次打开，均与修复一致。但批注提交与停止点选在压缩产物里死于依赖函数 `ReferenceError: o`（新登记 BUG-0146），点选提交链整体不可用；本修复本身验证通过。
