---
id: BUG-0030
type: bug
status: done
priority: P3
owner: apps/desktop
source: agent-browser 现场测试（demo 项目会话页文件树/消息列表在遮挡下为空）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0016]
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 窗口遮挡（document.hidden）期间 Virtuoso 虚拟列表不渲染任何行，遮挡粘滞时表现为可见窗口内列表空白

## 用户操作流程

1. 打开任一会话或项目文件面板，确认消息流/文件树正常显示；
2. 用另一个最大化窗口完全盖住 Open Forge（或最小化、锁屏、远程桌面挂断等
   让 OS 判定窗口被遮挡的操作）；
3. 数据层继续工作（发消息、文件树加载都在跑）；期间若发生整页重载
   或列表内容更新，再移开遮挡窗口观察列表。

## 实际行为与期望行为

- 实际：`document.hidden === true` 期间 Chromium 暂停 rAF 与
  ResizeObserver 派发，react-virtuoso 拿不到测量帧，item-list 渲染
  0 个子节点（实测 `padding-bottom` 仍有总高 1450px、无 item 元素）。
  遮挡状态粘滞（Electron/Chromium 已知平台问题：锁屏、RDP、显示器休眠、
  程序化窗口操作后可把可见窗口持续报为 occluded）时，用户看到的是
  一个「明明可见但列表全空」的窗口。
- 期望：列表数据到达后即可渲染行内容；最差情况下解除遮挡后应立即恢复，
  不应把「不可见期间」与「永远无法测量」混为一谈。

## 环境与失败证据

- 应用版本：dev main（BUG-0016 修复之后）；OS：Windows，双显示器。
- CDP 实测（demo 项目，cwd=E:\demo）：
  - `document.hidden === true`、rAF 探针 2s 内 0 次回调（`raf-stalled`）；
  - `fileTreeCacheAtom` 已有 `E:\demo → 5 条` 且 `chatMessagesAtom` 已有
    4 条消息，但 DOM `[role=treeitem]` / `[data-item-index]` 均为 0；
  - CDP `Page.setWebLifecycleState({state:"active"})` 强制一帧后：
    treeitem 5、msgitem 6 立即出现 → 证实纯测量停摆，数据层完好；
  - 重载会话页后（BUG-0016 修复生效、应用正常启动、会话恢复正确、
    h1 标题正确），列表仍需一帧才能出现内容。
- 对照：同窗口被最大化 Chrome 完全覆盖时 `document.hidden=true`，
  挪开/移窗后立即恢复渲染（非粘滞场景可自愈）。

## 最小复现

1. 让 Open Forge 窗口被完全遮挡（最大化窗口覆盖即可）；
2. 在遮挡期间触发 `location.reload()` 或打开文件面板；
3. 保持遮挡：`[data-item-index]` 计数为 0，item-list 为空；
4. 解除遮挡：列表恢复渲染（除非遇到 Electron 遮挡粘滞）。

## 影响

- 正常遮挡下用户看不到窗口，无直接损失；恢复遮挡后自愈。
- 真实风险在遮挡粘滞：Electron on Windows 存在已知遮挡状态滞留问题
  （本机现场已复现：窗口还原、无覆盖物、`document.hidden` 仍卡 true），
  此时用户面对可见窗口内的全空列表，等价于 BUG-0016 修复前的白屏观感，
  只是骨架屏换成了空列表。
- 与 BUG-0016 同源（hidden 下 rAF 停摆），但触发点在列表层而非启动门。

## 根因

react-virtuoso 的行渲染依赖视口尺寸测量（ResizeObserver → rAF 帧内派发）。
`document.hidden` 时这两层都停摆，virtuoso 在拿不到有效视口时选择
「不渲染任何行」，即使 `data` 非空。主窗口 `webPreferences` 未设置
`backgroundThrottling`（默认 true），与 remote-desktop host 的
`backgroundThrottling: false` 形成对比——后者正是为了保活渲染。

## 候选修复（已选 A）

- A. ✅ 主窗口 `webPreferences.backgroundThrottling: false`：遮挡期继续
  派发 rAF/RO，列表不再停摆，根上消除这一类问题；代价是遮挡期仍有
  少量渲染功耗（remote-desktop host 已采用同配置）。用户已确认选 A。
- B. Virtuoso `initialItemCount`/`initialTopMostItemIndex` 预渲染（未选）：
  只能救首屏，不解决遮挡期增量更新。

## 修复与验证

- 修复：`apps/desktop/src/main/window-manager.ts` 的
  `webPreferences` 增加 `backgroundThrottling: false`。
- 实机验证（最小化窗口下实测）：
  - `document.visibilityState === "visible"`（Electron 不再把遮挡窗口
    标记为 hidden）；
  - rAF 探针持续触发（修复前 2s 内 0 次，修复后约每秒仍有帧，足以驱动
    Virtuoso 测量）；
  - 消息列表在最小化状态下正常渲染（`[data-item-index]` > 0）；
  - BUG-0016 的启动门修复作为纵深防御保留。
- 回归测试：webPreferences 为 Electron 透传项，无有效单测层级；
  行为验证以上述实机证据为准。
