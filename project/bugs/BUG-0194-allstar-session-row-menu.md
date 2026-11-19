---
id: BUG-0194
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-19
related_requirement: [REQ-0030]
related_plan: []
related_tasks: [TASK-0492]
related_issues: []
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# 版块会话行尾的「···」点了会直接打开会话，而不是展开菜单

## 用户流程

- Given：版块首页有项目的开发会话（卡片内直显的会话行，或「全部 N 个」弹窗里的会话行）。
- When：用户把鼠标移到某条会话行尾，点击那个 `···` 图标。
- Then：应展开该会话的操作菜单（重命名 / 在文件夹中打开 / 删除）。

## 实际行为

会话被直接打开，跳到该会话页面。`···` 本身没有任何反应，也没有菜单出现。

## 期望行为

点 `···` 只展开三项菜单，不导航；点行内标题才打开会话。

## 环境与失败证据

- Windows 11 x64；桌面端 0.1.5 开发线，HEAD `445b66ae3`；2026-11-19 用户报告。
- 代码证据（修复前）：
  - `AllstarDevSessionsDialog.tsx:147`：`{/* SessionContextMenu 预留位（第三批）：纯视觉占位，不可聚焦不可点。 */}`，紧随其后的 `<span aria-hidden className="icon-[solar--menu-dots-bold] …">` 无任何事件处理；
  - `AllstarDevHomePageView.tsx:206`：卡片行同一份占位（注释写「第二批」）；
  - 两处的父节点均为 `<div role="button" onClick={() => model.onOpenSession(...)}>`（弹窗 138 行、卡片 187 行），点击冒泡到整行 → 打开会话；
  - 图标样式 `opacity-30 … group-hover/row:opacity-100`，悬停时变亮，视觉上明确宣告「可点」。

## 最小复现

1. 打开 `/allstar`，对某个项目点「全部 N 个」。
2. 把鼠标移到任意一条会话行尾的 `···` 上（它会从 30% 变到 100% 不透明）。
3. 点击：会话被打开，菜单不出现。

## 影响

可见的可交互暗示做出了相反的行为，误触成本高（直接离开列表、丢失当前浏览位置）；用户对「行尾图标」的信任被消耗一次。

## 根因证据

- 占位图标是纯装饰节点（`aria-hidden`、无 handler、不可聚焦），设计上留给后续的 `SessionContextMenu`；在它被接上之前，点击必然穿透到整行的打开回调。
- 该实现同时暴露两个问题：一是「假可交互元素」（视觉可点、行为无），二是「整行 `role="button"` 包住了本该独立的次级操作位」——后者会让任何后续接入的菜单按钮触发非法嵌套按钮与冒泡误触。

## 回归测试

- `AllstarDevHomePageView.test.tsx` 新增用例「行尾「···」是独立菜单入口：点它不打开会话，只展开三项动作」：点击 `aria-label=session actions` 的按钮后断言 `onOpenSession` 未被调用，且三项菜单项存在。
- 新增用例「会话菜单三项各自回调」：验证重命名（输入 + Enter 提交）、在文件夹中打开、删除三项分别落到 model 回调。
- 既有结构契约用例（团队行与普通行同构、卡片行与弹窗行类名序列一致）同步改为按「标题按钮 + 菜单按钮」断言。

## 修复与验证

- 修复：抽出 `AllstarSessionRow`，卡片与弹窗共用；整行改为普通容器，标题本身是打开会话的按钮，行尾 `···` 是独立的 DropdownMenu 触发器；重命名走行内输入框（Enter 提交 / Esc 取消 / 失焦提交）。
- 动作范围：只接重命名 / 在文件夹中打开 / 删除三项——置顶与归档在侧栏没有承载面（代码会话不进普通侧栏列表），放进去会是新的假动作。
- 检查：`run-vitest.mjs --run AllstarDevHomePageView.test.tsx`（20/20）、`useAllstarDevHomePageModel.test.tsx`（4/4）；`bun run check:quick -- <改动文件>` 全绿（含 DESIGN D03：标题按钮改用共享 `Button`）。
- 未运行及原因：真实浏览器目视与删除/改名的真机闭环需当次授权，未执行。
- 剩余风险：删除与改名复用既有 IPC 链路（`session.rename/delete`、`agentTeams.renameSession/deleteSession`），其失败反馈依赖 toast；普通会话删除失败的用户可见性另有 `BUG-0191` 在跟。
