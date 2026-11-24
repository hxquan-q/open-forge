---
id: TASK-0490
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
related_bugs: [BUG-0193]
execution: serial
branch: unassigned
worktree: unassigned（主工作区串行）
base_commit: 10f2458faccca144632941f56f626a182b0f12cd
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/src/renderer/root-layout
  - packages/theme-ui/src/layout
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
  - project/bugs/BUG-0193-allstar-home-content-not-full-width.md
  - .github/release-notes/fragments/v0.1.5
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# 修复 Allstar 版块首页未撑满内容区宽度（BUG-0193）

## 合同

- 来源与目标：`BUG-0193`。用户 2026-11-19 提供截图报告：`/allstar` 版块首页只占内容区约一半，右侧大片空白。本任务只修这一件事。
- 输入 → 输出：`AllstarDevHomePageView.tsx` 页面根 classlist → 补 `w-full`（与既有 `min-w-0` 并存）；`loading` 分支同样补 `w-full`；注释说明「行向 flex 主轴不 stretch」的成因。渲染逻辑、文案、回调零变化。
- 做 / 不做：
  - 做：宽度声明一处 + 注释、BUG 记录、发布说明碎片、既有定向测试回归、`check:quick`。
  - 不做：不动 `MainContentFrame`（其他全宽页面自己声明 `w-full`，宿主侧不替业务页决定宽度）；不改网格 `minmax` 阈值与列数策略；不新增 jsdom 布局断言或 class 名断言（无布局引擎，且不应锁实现）；不新搭 `/allstar` E2E。
  - 并发结论：串行。改动只涉及一个渲染文件 + 台账，无共享写域拆分收益，不单开任务分支与 Worktree；实际工作在主工作区的个人开发分支 `chenxvhua` 上完成，`branch` 因此记 `unassigned`。
- Given / When / Then：
  - Given 窗口宽于内容 max-content（约 720px），When 打开 `/allstar`，Then 页面根宽度等于内容区宽度，网格按可用宽度自动增列，页头右簇贴右缘。
- 保留：`BUG-0188` 的宽度收缩断链（`min-w-0`）与卡片行内部消化溢出的行为不变。
- 验证：`bun run check:quick -- <改动文件>`；定向测试 `AllstarDevHomePageView.test.tsx`、`useAllstarDevHomePageModel.test.tsx`。
- 人工验收：用户在 dev 实例（HMR 生效）确认网格铺满内容区、右侧无异常空白。

## 交付

- 实际修改与验证：见下方「交付记录」。
- 评审与集成：自审；`integration_status` 保持 `pending`，未 push。
- 发布：`.github/release-notes/fragments/v0.1.5/bug-0193-allstar-home-width-fill.md`。

## 交付记录

2026-11-19 实施完成（base_commit `10f2458fa`）：

- `AllstarDevHomePageView.tsx`：页面根 `flex h-full min-w-0 flex-col gap-5 px-8 pb-8 pt-6` → `flex h-full w-full min-w-0 flex-col gap-5 px-8 pb-8 pt-6`；`loading` 分支补 `w-full`（加载态居中同样需要撑满，否则转圈贴左）。注释改写为「w-full 撑满 + min-w-0 断链」两条成因并列。
- 诊断过程（留档）：父级 `MainContentFrame` 内容区是行向 flex，`align-items: stretch` 只管交叉轴，缺宽度的子项退化为 max-content；该页 max-content 由页头文案与按钮组决定（约 700px），网格 `auto-fill minmax(13rem,1fr)` 在 700px 下恰排 3 列，与用户截图（3 列、右侧约 400px 空白）逐项吻合。对照 `WeKnoraPageView.tsx` 的 `h-full w-full flex-1` 确认是漏写而非有意收窄。
- 定向测试：`run-vitest.mjs --run AllstarDevHomePageView.test.tsx useAllstarDevHomePageModel.test.tsx` → 2 文件 22/22 通过。
- `bun run check:quick -- apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx` → 全绿。
- 发布说明：碎片 + `release-notes.mjs --assemble` 汇编，`v0.1.5.md` 仅新增 1 行。

### 未运行项

- 真实浏览器红→绿（CDP 附着 dev 实例）：`verify:ui:*` 需当次授权，未执行；用户可经 HMR 直接目视确认。
- `bun run test:impact` / 完整 `bun run check`：按仓库约定作为独立行为由用户决定。

### 遗留

- 无自动化布局不变量锁定（jsdom 无布局引擎，且不应断言 class 名）；建议后续 `/allstar` E2E 与 `BUG-0188` 的遗留项合并断言「页面根 `offsetWidth` == 内容区宽度」。
