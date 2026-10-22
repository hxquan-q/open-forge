---
id: BUG-0146
type: bug
status: verifying
priority: P1
owner: desktop
requirement:
plan: PLAN-0006
source: 用户要求验证 browser tab 效果（2026-10-22）；Fresh 隔离实例真实 UI 验证发现，与 BUG-0136「真实 Desktop 未人工验收」互为印证
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0360, TASK-0365]
related_bugs: [BUG-0136, BUG-0145]
related_issues: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 注入 guest 的依赖函数在压缩产物里抛 `ReferenceError: o`，点选提交链与停止点选在真实 Desktop 上必死并卡死会话

## 用户流程

- Given：内置 Browser 已打开页面，点选模式已打开（TASK-0365 修复后批注能正常出现）。
- When：用户在批注里写下要求并点「发送给 Agent」；或按住 Alt 点选把元素放进对话输入框；或再次点工具栏按钮退出点选。
- Then：发送应把元素与批注送进当前会话，Alt 应把单个元素放进输入框，退出应干净收尾。

## 实际行为

- 批注框随提交消失，但会话没有新消息、输入框没有元素附件；点选从此失效——罩层不再出现，重新开关点选也没用，直到重启 Desktop。
- 退出点选同样无声失败。
- Fresh 隔离实例（`verify:ui:start:fresh`，2026-10-22 构建 `main-DQWMoi5L.js`）webview console 两条实证：
  - 多选批注点「发送给 Agent」：`ReferenceError: o is not defined` at `Object.o6t [as readSourceHint]`，调用栈 `Array.map → finishPick → finishAnnotation → form submit`。
  - 退出点选：`ReferenceError: o is not defined` at `Object.h6t [as revertLiveEditEntries]`，经 `revertAllLiveEdits` → `stop`。

## 期望行为

依赖函数（`choosePickTarget`、`applyLiveEdit`、`revertLiveEditEntry`、`revertLiveEditEntries`、`readSourceHint`）按 `.toString()` 注入后在压缩产物里照常工作；单次点选失败也不应把 picker 会话永久卡死。

## 环境与失败证据

- Desktop `dev:verify` 构建（Fresh Profile，2026-10-22），`apps/desktop/dist/main/main-DQWMoi5L.js`。
- 主进程是 esbuild 单文件产物且开 `keepNames`。依赖函数体内的命名内层箭头（如 `readBrowserElementSourceHint` 的 `readFile`/`readName`/`readLine`/`parseLocation`、`revertInAppBrowserLiveEditEntries` 的 `kebabCase`）被插入 `__name(fn, "name")` 包装，minify 后收缩为单字母 `o`。
- `assembleGuestScript` 的垫片 `function o(target){return target}` 声明在 IIFE **体内**；依赖函数源码嵌在 IIFE **调用的实参** `deps` 里。实参表达式按词法处于脚本顶层作用域，体内函数声明对它不可见——创建函数时不求值，所以 `start` 能成功、罩层能出现；等依赖函数真正被调用（`collect()`、`revertAllLiveEdits`）才抛 `ReferenceError`。
- `webview-picker-guest.ts` 的 `finishPick` 先撤罩层、清 store，再在 `state.resolve({...collect(selected)...})` 里调 `collect`；`collect` 无兜底，抛错后 promise 永不 settle。`runPicker` 以 `session.pickerWaiter` 判重入，该 promise 永久 pending，之后每次 `runPicker` 直接 return（`setPicker` 开关、页面导航均不解卡，唯一恢复是重启 Desktop）。
- `choosePickTarget` 依赖同样带 `o` 调用，但 `pickTarget` 的 try/catch 兜底退回事件目标，把故障掩盖成「碰巧能用」。

## 最小复现

1. `bun run verify:ui:start:fresh`，打开内置 Browser，加载任一页面，开「选取元素」。
2. 单击元素（批注出现），Shift 点第二个，点「发送给 Agent」。
3. 批注消失，会话无新消息；webview console 出现 `ReferenceError: o is not defined`。
4. 再点其他元素：批注不再出现；重启 Desktop 前点选整体不可用。

## 影响

点选 → 批注 → 发送 / Alt 放入输入框整条提交链在压缩产物里不可用；BUG-0136 的 renderer 侧修复（TASK-0351）因此从未在真实环境生效过。即时改稿（`apply-edit`/`revert-edit`）与停止点选同病。

## 根因证据

- `apps/desktop/src/main/browser-automation/guest-script-shim.ts`：`assembleGuestScript` 把垫片拼进 IIFE 体（`void 0;(function(command,arg,deps){${shim}return ${expression}})(${arguments})`），`arguments` 中的依赖字面量在体外求值。
- `apps/desktop/src/main/browser-automation/webview-picker-guest.ts`：`guestDepsLiteral` 内联各依赖 `.toString()`；`finishPick` 的 resolve 参数里调用 `collect`。
- 为什么既有测试全绿：`runInAppBrowserGuestCommand` 直调真实绑定（未经 minify，无 `o` 引用）；「注入脚本整段求值」用例求值的是未压缩 TS 源。两者都测不出压缩产物的自由标识符缺失。

## 回归测试

- 用压缩产物形态做注入级测试：对依赖函数源码构造带 `__name` 包装的形态（或在测试里先经 esbuild minify+keepNames），组装脚本后在无 `o` 的作用域求值，点选提交（`finishPick` → resolve 值含 `sourceHint` 字段）与 `stop` 都能完成。
- 会话不卡死回归：任一命令脚本抛错后，`setPicker` 关-开能重新注入 guest 并完成一次新点选（可用假 `webContents` 替身断言 `executeJavaScript` 被再次调用）。

## 修复与验证

- 修复：TASK-0366。`assembleGuestScript` 把垫片改为外层 IIFE 形参注入，实参与内层 `expression` 都词法可见，无辅助函数时保持既有形状；外层补 `return` 保住脚本完成值（BUG-0052）。
- 测试：`guest-script-shim.test.ts` 新增 2 例（修复前红：实参位置的依赖函数调用抛 `ReferenceError: o`；修复后绿），连同 picker guest 13、session controller 10、picker hook 6、agent guest、picker target 全绿。
- 真实 Desktop（Fresh 实例复验，2026-10-22）：批注发送后 webview console 零 `ReferenceError`，批注文字、元素截图与「按钮 A」附件进入输入框（无活动会话按 BUG-0136 合同留在草稿）；Alt 交付「按钮 C」chip；停止/重开点选罩层正常回归，picker 会话可循环，卡死消失。
- 未运行及原因：完整 `bun run check`（工作区尚有 TASK-0365 未提交文件）；真实模型回合未验证（无 Provider）。
