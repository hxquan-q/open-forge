---
id: BUG-0188
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-12
related_requirement: [REQ-0030]
related_plan: []
related_tasks: [TASK-0485]
related_issues: []
created: 2026-11-12
updated: 2026-11-12
---
<!-- Copyright The Open Forge contributors. -->

# Allstar 版块首页被项目卡片行横向撑爆，底部新建会话功能区被推出视口

## 用户流程

- Given：开发版已登记较多项目（本次实测 18 张卡片来源：版块册 + coding 会话池 + 团队会话投影）。
- When：用户点击左侧栏「Allstar自主开发」页签进入版块首页（`/allstar`）。
- Then：应看到项目卡片区与底部「打开已有项目 / 项目选择器 / 新建开发会话」功能区。

## 实际行为

首页先短暂完整渲染（挂载瞬间版块册尚未回填、卡片少），随后异步数据（`project.list()`、`loadSessions`、团队侧栏投影）陆续回填，项目卡片行膨胀到 18 张（每张 `w-60 shrink-0`）。底部新建会话功能区闪现后消失，且页面无法横向滚动找回。

## 期望行为

卡片行溢出在自身 `overflow-x-auto` 内滚动消化；页面宽度恒等于内容区宽度；底部新建会话功能区始终居中可见。

## 环境与失败证据

- Windows 11 x64；dev 实例（`task/TASK-0483-session-hot-tracking-toggle` 工作树，HEAD `6fa648704`）；2026-11-12 用户报告并于当日 dev 实例复测。
- 渲染层日志（`~/.openforge-dev/desktop-app/logs/render/2026-11-12.log`）21:24:23 / 21:41:57 两次复现时刻各有一条 `Blocked aria-hidden` 警告（伴随现象，非根因）。
- 通过 CDP 只读检查运行中实例的实测数字（修复前，视口 1536px、内容区 1308px）：
  - 页面根 div（`flex h-full flex-col gap-5 px-8 pb-8 pt-6`）宽 **4588px**，computed `min-width: auto`；
  - 卡片行宽 4524px（18×240 + 17×12 gap），`clientWidth == scrollWidth == 4524`（自身滚动未触发）；
  - 底栏宽 4524px，`justify-center` 把三个控件中心排到 x≈2514px，整体在视口外；
  - `document.documentElement.scrollWidth == 1536`（无横向滚动可找回）。

## 最小复现

1. 版块册/会话池中的卡片来源合计宽度超过内容区宽度（约 ≥6 张卡即可在常见窗口宽度触发）。
2. 打开 `/allstar`，等待异步回填完成。
3. 观察底部新建会话功能区：闪现（回填前）→ 消失（回填后），且不可滚动找回。

## 影响

版块首页核心动作区（新建开发会话 / 打开已有项目 / 项目选择）整体不可达，版块不可用级缺陷；卡片越多越必现。

## 根因证据

- flex 子项的自动最小尺寸（`min-width: auto`）取内容 min-content：页面根 div 是 `MainContentFrame` 内容区行向 flex 容器的子项，未声明 `min-w-0`；卡片行内卡片为 `shrink-0` 固定宽，其 min-content 沿 section（仅 `min-h-0`，无宽度约束）→ 页面根 → 行向容器逐级顶宽到 4588px（上节实测）。
- 卡片行自身的 `overflow-x-auto` 因此从未生效（内容没有超出它自身的超宽盒）。
- 与 BUG-0187 团队会话并入无因果（该切片只是增加了卡片来源数量）；页面自创建起即缺宽度断链，卡片足够多时任何版本都会触发。

## 回归测试

- 自动化缺口说明：本缺陷为纯 CSS 布局行为，jsdom/happy-dom 无布局引擎，组件测试无法断言溢出；仓库 WebdriverIO E2E 需 dist 构建产物且为首个 UI 路由用例，本片按比例未新增（遗留项见 TASK-0485）。
- 替代验证（真实浏览器红→绿）：CDP 只读测量用户 dev 实例同一组节点——修复前 4588px/底栏出视口（见上），修复后页面根 1308px（`min-width: 0px` 生效）、卡片行 `clientWidth 1244 / scrollWidth 4524`（滚动收进卡片行内部）、底栏三控件 x∈[620,1128] 全部在 1536px 视口内且整组居中。
- 既有行为测试回归：`AllstarDevHomePageView.test.tsx` + `useAllstarDevHomePageModel.test.tsx` 8/8 通过（从 apps/desktop 目录内跑 runner）。

## 修复、验证与剩余风险

- 修复：`AllstarDevHomePageView.tsx` 页面根补 `min-w-0`（含成因注释）。
- `bun run check:quick -- <改动文件>`：除 WAIVER-0011/0012 过期（2026-11-11，存量治理项，与本次无关）外全绿。
- 剩余风险：无自动回归测试锁定，未来若有人移除该 class 或重构布局链，只有 E2E/人工能拦截；waiver 存量项待 owner 复审。
- 人工验收：待用户在 dev 实例确认新建会话功能区稳定可见（status: verifying）。
