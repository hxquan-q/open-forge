---
id: TASK-0366
type: task
status: verifying
priority: P1
owner: desktop
requirement:
plan: PLAN-0006
source: BUG-0146；用户要求验证 browser tab 效果时在真实 Desktop 实证发现，并授权当场修复
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0360, TASK-0365]
related_bugs: [BUG-0146]
related_issues: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 1853699c9
read_paths:
  - apps/desktop/src/main/browser-automation/guest-script-shim.ts
  - apps/desktop/src/main/browser-automation/guest-script-shim.test.ts
  - apps/desktop/src/main/browser-automation/webview-picker-guest.ts
  - apps/desktop/src/main/browser-automation/webview-live-edit.test.ts
write_paths:
  - apps/desktop/src/main/browser-automation/guest-script-shim.ts
  - apps/desktop/src/main/browser-automation/guest-script-shim.test.ts
  - apps/desktop/src/main/browser-automation/webview-live-edit.test.ts
  - project/bugs/BUG-0146-browser-guest-name-helper-scope.md
  - project/bugs/README.md
  - project/tasks/TASK-0366-browser-guest-name-helper-scope.md
  - project/tasks/README.md
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 注入 guest 的垫片对 deps 实参可见

## 目标

压缩产物里注入 guest 的依赖函数不再抛 `ReferenceError: o`：点选提交（批注发送、Alt 放入输入框）、即时改稿和停止点选在真实 Desktop 上可用，且单次失败不再把 picker 会话永久卡死。

## 范围

### 并发评估

- 结论：串行，主工作区，不拆 worktree。
- 冲突文件：无（`webview-picker-guest.ts` 归 TASK-0365，本任务不写它）。

### 做

- `assembleGuestScript` 把垫片从内层 IIFE 体内挪到外层 IIFE 形参：实参表达式与内层 `expression` 都词法可见，不向页面全局泄漏绑定。
- 无辅助函数时保持与源码逐字一致的既有形状（既有形状测试钉住）。
- 回归测试：deps 实参里带 keepNames 形状的依赖函数可被调用（旧实现先红）；多别名覆盖；外层 IIFE `return` 保持脚本完成值（BUG-0052 不回归）。

### 不做

- 不改 `webview-picker-guest.ts`（TASK-0365 独占中）。
- 不给 waiter 加超时解卡（另行评估）；修复后触发条件已消失。

## Given / When / Then

- Given：主进程产物把依赖函数的命名内层箭头包成 `o(...)`。
- When：组装 `start` 脚本并整段求值，再调用依赖函数。
- Then：求值与调用都成功（旧实现调用时抛 `ReferenceError: o is not defined`）。
- Given：任一命令的注入脚本执行。
- When：读取脚本完成值。
- Then：完成值仍是 `expression` 的结果，不因外层包装变成 undefined。

## 测试与验证

- 定向：`guest-script-shim.test.ts`（新增 2 例先红后绿）、`webview-picker-guest.test.ts`、`webview-agent-guest.test.ts`、`webview-session-controller.test.ts`、`webview-picker-target.test.ts`。
- 存量测试债：`webview-live-edit.test.ts` 的 `pickButton` 自 b5e601a61（点中元素改为打开批注卡）起挂起未同步，本任务更新为批注提交完成点选，8 例全绿。
- 真实 Desktop：Fresh 隔离实例 + 本地测试页，完整走 TASK-0360 功能验收包（见交付记录）。

## 必须保持

- 无辅助函数时脚本形状逐字不变。
- 脚本完成值语义（BUG-0052）。
- 垫片不污染页面全局作用域。

## 验收分层

- 工程验证：定向测试与真实 Desktop 验证通过。
- 技术评审：自审。
- 集成：pending。
- 人工功能验收：待验收。
- 发布：未授权。

## 交付记录

- 实际修改：`guest-script-shim.ts` 外层 IIFE 形参注入垫片；`guest-script-shim.test.ts` 新增 2 例（实参可见性、多别名）；`webview-live-edit.test.ts` 同步批注流。
- 实际运行：shim 8 例（修复前新增 2 例红：`ReferenceError: o is not defined`，修复后绿）；picker guest 13、session controller 10、picker hook 6、agent guest 与 picker target 全绿；live-edit 8 例（修复前 3 例存量超时红）。
- 真实 Desktop（Fresh 实例 + 本地测试页）：批注发送后 webview console 零 `ReferenceError`；批注文字、元素截图（图 1）与「按钮 A」附件进入输入框（无活动会话，按 BUG-0136 合同留在草稿不丢）；Alt 点选交付「按钮 C」chip；停止/重开点选罩层正常回归，picker 会话可循环（卡死消失）；页面按钮全程未被触发。
- 未运行及原因：完整 `bun run check`（工作区尚有 TASK-0365 未提交文件）。
- Worktree：未拆。
- 剩余风险：waiter 仍无超时保护，若未来再出现「脚本求值通过但 promise 永不 settle」的缺陷仍会卡死（触发条件已消除）；真实模型回合的端到端发送未验证（无 Provider，客观阻塞）。
