---
id: BUG-0193
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-19
related_requirement: [REQ-0030]
related_plan: []
related_tasks: [TASK-0490]
related_issues: []
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# Allstar 版块首页只占内容区约一半宽度，右侧留大片空白

## 用户流程

- Given：窗口处于常规尺寸（用户截图实测窗口 1080×640，左侧栏约 205px，内容区约 875px），版块已登记 5 个项目。
- When：点击左侧栏「Allstar自主开发」页签进入版块首页（`/allstar`）。
- Then：项目卡片网格应铺满主内容区宽度，按 `auto-fill` 自动决定列数。

## 实际行为

卡片网格右侧留下约 400px 空白（内容区 875px，页面实际占约 700px 后即结束）；窄窗口下看不出问题，窗口越宽空白越大。截图（2026-11-19 用户提供）：三列卡片止于内容区中线偏右，其后全部为背景色，页头两个按钮也未贴到内容区右缘。

## 期望行为

页面根宽度等于主内容区宽度：网格按 `repeat(auto-fill, minmax(13rem, 1fr))` 在整幅内容区内排布，页头右簇（打开已有项目 / 新建开发会话）贴内容区右缘。

## 环境与失败证据

- Windows 11 x64；dev 实例（`bun run dev`，数据目录 `~/.openforge-dev`）；桌面端 0.1.5 开发线，HEAD `10f2458fa`；用户截图 `Clipboard_Screenshot.png`（1080×640）。
- 截图量纲换算：卡片宽约 143px，按 13rem 最小轨宽反推缩放比 ≈0.69，即逻辑宽约 208px（=13rem）；网格恰为 3 列、2 个 12px 间隙，加页面左右 `px-8`（各 32px）合计约 700px，与页面根实际宽度一致。
- 逐项排除：非 `MainContentFrame` 的 `max-w`（`packages/theme-ui/src/layout/MainContentFrame.tsx:50` 内容区为 `flex min-h-0 flex-1`，无宽度上限）；非主题注入（`sidebar-*` 与 `app-*` 规则只处理底色与出血）；非网格列宽配置（列宽与 13rem 吻合，说明 grid 生效、只是容器窄）。

## 最小复现

1. 打开 `/allstar`，窗口宽度 ≥1000px。
2. 观察项目卡片网格右缘：网格在内容区约一半处结束，右侧为空白。
3. 拉宽窗口：卡片不增列、右缘位置不变，空白同步变宽。

## 影响

视觉与信息密度损失：宽屏下可用空间浪费约一半，卡片区看起来像"半屏小部件"；不影响功能可达性（`BUG-0188` 的底栏不可达问题已单独修复且未回退）。

## 根因证据

- `AllstarDevHomePageView.tsx` 页面根为 `MainContentFrame` 内容区行向 flex 容器的**直接子项**（`<Outlet />` 无额外 DOM 包装），类名为 `flex h-full min-w-0 flex-col gap-5 px-8 pb-8 pt-6`——**没有 `w-full`，也没有 `flex-1`**。
- 行向 flex 的 `align-items: stretch` 只作用交叉轴（高度），主轴宽度由 `flex-basis: auto` 决定，即内容的 max-content（受可用宽度上限约束，但不会主动撑满）。
- 该页 max-content 由页头决定：标题 + 说明整句（不断行）约 364px，右簇两个按钮约 280px，加 `gap-4` 与 `px-8` 合计约 720px——与截图约 700px 的实测一致；网格 `auto-fill` 在该宽度下只排得下 3 列 13rem 轨道。
- 成因追溯：`81eebb35e` 修 `BUG-0188` 时为断掉 min-content 顶宽链加了 `min-w-0`，解决了"撑得过宽"，但没有补"必须撑满"，于是宽度从"被卡片行顶宽"翻到"被页头文字锁窄"。对照组 `domains/weknora/components/WeKnoraPageView.tsx:174` 写的是 `h-full w-full flex-1`，全宽页面应有的声明它都有。

## 回归测试

- 自动化缺口说明：纯 CSS 布局行为，jsdom/happy-dom 无布局引擎，组件测试既断言不了真实宽度，也不该锁 class 名（`AllstarDevHomePageView.test.tsx` 全部断言用户可见行为，不读 class）。与 `BUG-0188` 同一缺口，未在本次新搭 E2E。
- 替代验证：见「修复与验证」；建议后续 `/allstar` E2E 一并断言"页面根 `offsetWidth` 等于 `MainContentFrame` 内容区宽度"。

## 修复与验证

- 修复：页面根补 `w-full`（与既有的 `min-w-0` 并存：撑满 + 断链），成因注释同步说明；`loading` 分支同样补 `w-full`，避免加载态居中把转圈贴到左侧。
- 检查：`bun run check:quick -- apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx`。
- 既有行为测试回归：`AllstarDevHomePageView.test.tsx`、`useAllstarDevHomePageModel.test.tsx`。
- 未运行及原因：真实浏览器红→绿（CDP 附着 dev 实例）需用户当次授权，未执行；结果待人工验收填入。
- 剩余风险：无自动化布局不变量锁定；若未来有人把 `w-full` 换成只影响交叉轴的写法，只有 E2E/人工能拦截。
