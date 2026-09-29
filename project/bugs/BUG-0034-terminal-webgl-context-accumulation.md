---
id: BUG-0034
type: bug
status: verifying
priority: P3
owner: apps/desktop
source: agent-browser 现场测试（底部面板三分屏终端控制台持续告警）
related_requirement: []
related_plan: []
related_tasks:
  - TASK-0120
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 多分屏终端持续新增 WebGL context，触发「Too many active WebGL contexts」告警

## 用户流程

- Given：会话页底部面板打开终端；
- When：连续「向右分屏 / 向下分屏」创建多个终端 leaf（最多 8 个），
  并反复收起/重开或切换会话；
- Then：每个终端面板正常工作，不积累渲染资源。

## 实际行为

- 控制台持续输出 `WARNING: Too many active WebGL contexts. Oldest context will be lost.`；
- 分屏出 3 个终端后告警反复出现，说明 context 创建次数远超可见终端数；
- 终端功能暂未受损，但 Chromium 会回收最旧 context——被回收的 xterm
  画布将失去渲染（黑屏/空白终端），且旧 context 若未显式 dispose 属于泄漏。

## 期望行为

- 每个活跃终端恰好持有一个 WebGL context；
- 关闭/隐藏/销毁 leaf 时释放对应 context；切换会话或面板重排不额外新建。

## 环境与失败证据

- 应用版本：dev main；OS：Windows。
- 实测：底部面板 3 个终端 leaf 期间控制台反复出现该告警；
  底部面板为虚拟挂载结构，分屏/重开时 xterm 实例可能被重复创建而未释放。

## 最小复现

1. 打开会话 → 底部面板 → 终端；
2. 连续两次分屏（向右、向下），观察 DevTools 控制台；
3. 收起并重新打开底部面板若干次，告警数量随操作增长。

## 影响

- 重度分屏或长期使用后，最旧终端的 WebGL context 被 Chromium 强制回收，
  表现为该终端画布空白——用户会误以为终端断开；
- context 泄漏也意味着 GPU 资源随操作持续占用。

## 根因（待确认）

疑似 xterm `WebglAddon` 的加载/释放未与 leaf 生命周期对齐：
分屏重建、面板收起重开或会话切换可能重复 `loadAddon` 而未 `dispose`。
置信度中——需用 `CONTEXT_LOST` 事件或实例计数确认。

## 回归测试方向

- leaf 挂载/卸载 × N 后活跃 WebGL context 数恒定（可用
  `canvas.getContext("webgl")` 计数桩或 WebglAddon dispose spy 断言）。

## 修复与验证

- 根因确认：与 BUG-0041 同源——卸载时 WebglAddon 只在 `terminal.dispose()`
  内部被连带销毁，xterm 6 先清 linkifier 再轮 addon 的销毁顺序使渲染 addon
  收尾必抛 TypeError，异常路径上 WebGL context 残留；反复分屏/重开即累积。
  置信度从「中」升为「高」：host 测试对旧实现复现 0/3 次释放。
- 修复：BUG-0041 已实施——卸载时先单独摘除渲染 addon（`rendererAddon.dispose()`）
  再 `terminal.dispose()`，销毁期异常只记日志；叠加既有缓解（仅活动 leaf 用
  WebGL，见 `select-terminal-renderer.ts`）。
- 回归测试（TASK-0120 验收项 2）：
  - `TerminalSurface.host.test.tsx` 新增挂载/卸载循环用例：3 轮后 3 个 WebGL
    addon 全部 dispose（对旧实现验证为红，0/3）；
  - `select-terminal-renderer.test.ts`：钉死活动格/非活动格/无 WebGL2/
    context 丢失后的渲染后端选择合同。
- 验证：定向测试与 `check:quick` 通过；验收项 1（实机 DevTools 控制台复核
  告警消失）需 verify:ui，未运行，故保持 verifying。
