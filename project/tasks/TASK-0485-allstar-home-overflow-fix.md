---
id: TASK-0485
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-12
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0188]
execution: serial
branch: task/TASK-0483-session-hot-tracking-toggle
worktree: unassigned（主工作区串行）
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/renderer/root-layout
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
  - project/bugs/BUG-0188-allstar-home-overflow.md
  - .github/release-notes/fragments/v0.1.5
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-12
updated: 2026-11-12
base_commit: 6fa648704d62087d3dfd1f2337880d5da7127d22
---
<!-- Copyright The Open Forge contributors. -->

# 修复 Allstar 版块首页横向溢出——新建会话功能区被推出视口（BUG-0188）

## 合同

- 来源与目标：`BUG-0188`。用户 2026-11-12 报告：点击侧栏「Allstar自主开发」页签后，版块首页底部新建会话功能区闪现后消失。本任务只修这一件事。
- 输入 → 输出：`AllstarDevHomePageView.tsx` 页面根 div classlist → 增加 `min-w-0`（附成因注释）；其余渲染逻辑、文案、回调零变化。
- 做 / 不做：
  - 做：宽度收缩断链一处 + BUG 记录 + 发布说明碎片 + 既有测试回归 + 真实浏览器红→绿实测。
  - 不做：不动 section/卡片行结构（section 处于纵向 flex，横宽由 stretch 决定，无 min-width 陷阱）；不新增 jsdom 布局断言（无布局引擎，断言不了真实溢出）；不搭首个 UI 路由 E2E（需 dist 构建产物，代价与本片不成比例，列为遗留）；不处理渲染日志中的 `Blocked aria-hidden` 警告与 `l.on is not a function` 报错（伴随现象/独立问题，另行分诊）。
- Given / When / Then：
  - Given 卡片来源宽度合计超过内容区，When 打开 `/allstar` 且异步数据回填完成，Then 页面根宽度等于内容区宽度，卡片溢出在卡片行内部横向滚动，底部新建会话功能区居中可见。
- 验证：
  - 既有定向测试：`bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.test.tsx src/renderer/domains/allstar-dev/hooks/useAllstarDevHomePageModel.test.tsx`（apps/desktop 目录内）；
  - 真实浏览器红→绿：CDP 只读测量用户 dev 实例修复前后同一组节点（数字见 BUG-0188）；
  - `bun run check:quick -- <改动文件>`。
- 人工验收：用户在 dev 实例确认功能区稳定可见。

## 交付

- 实际修改与验证：见下方「交付记录」。
- 评审与集成：自审；`integration_status` 保持 `pending`，未 push。
- 未运行与风险：如实记录。
- 发布：`.github/release-notes/fragments/v0.1.5/bug-0188-allstar-home-overflow.md`。

## 交付记录

2026-11-12 实施完成（base_commit `6fa648704`）：

- `AllstarDevHomePageView.tsx`：页面根 `flex h-full flex-col gap-5 px-8 pb-8 pt-6` → `flex h-full min-w-0 flex-col gap-5 px-8 pb-8 pt-6`，附三行成因注释（min-content 顶宽链、断链位置、溢出由卡片行消化）。
- 诊断过程（留档给下一个调试者）：CDP 只读定位——`#/allstar` 下页面根 4588px / 底栏中心 x≈2514 出视口 / 卡片行 clientWidth==scrollWidth（滚动未触发）；根因为 flex 子项 `min-width:auto` 沿链传播卡片 min-content，非元素移除、非弹层遮挡、非路由切换；渲染日志 21:24/21:41 两条 aria-hidden 警告为伴随现象。
- 红→绿实测（用户 dev 实例，Vite HMR 生效后同组节点）：页面根 4588→1308px（`min-width: 0px`）；卡片行 clientWidth 1244 / scrollWidth 4524（滚动收回行内）；底栏三控件 x∈[620,1128] 全在视口内、整组居中。
- 定向测试 8/8 绿；`check:quick` 除 WAIVER-0011/0012 存量过期外全绿。

### 未运行项

- `bun run test:impact` / 完整 `bun run check`（改动仅一处 class + 注释，已跑定向测试与 quick；全量由收尾批次统一执行）。
- WebdriverIO E2E、`verify:ui:*`（未获当次授权；E2E 需 dist 构建产物，遗留项）。

### 遗留

- 无自动化回归锁定本布局不变量（jsdom 无布局引擎；首个 UI 路由 E2E 的搭建成本超出本片）。后续若做 `/allstar` E2E，断言建议：页面根 `offsetWidth <= MainContentFrame 内容区宽度` 且卡片行 `scrollWidth > clientWidth` 时页面根无横向溢出。
- 渲染日志 `Uncaught TypeError: l.on is not a function`（每次启动 ~50s 后两条，来源待查）与 `Blocked aria-hidden` 警告：独立问题，未分诊。
- WAIVER-0011/0012 过期存量治理（owner 复审）。

### 已知风险与限制

- 若未来重构把 `min-w-0` 移到其他层级或改用 CSS grid（DESIGN.md 的 auto-fill+minmax 方案），需重新验证宽度断链位置；注释已锁定成因。
