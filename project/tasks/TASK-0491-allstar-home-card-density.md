---
id: TASK-0491
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement: REQ-0030
source: user-request-2026-11-19
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: unassigned（主工作区串行）
base_commit: 64e8699cd
read_paths:
  - apps/desktop/src/renderer/domains/allstar-dev
  - apps/desktop/DESIGN.md
write_paths:
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx
  - apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.test.tsx
  - .github/release-notes/fragments/v0.1.5
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-19
updated: 2026-11-19
---
<!-- Copyright The Open Forge contributors. -->

# Allstar 版块首页卡片放大 125% 并拉开左右间距

## 合同

- 来源与目标：用户 2026-11-19 反馈「项目卡片太窄、卡片之间间距太小」，要求卡片宽度增至当前 125%、每张卡片左右各加 10px 间距。
- 输入 → 输出：网格 `grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3` → `minmax(16.25rem,1fr)`（260px = 13rem×1.25）+ `gap-x-8 gap-y-3`（横向 12→32，即左右各 +10；纵向保持 12 的行距节奏）。卡片内部结构、字号、内边距、交互零变化。
- 做 / 不做：
  - 做：网格两处声明 + 成因注释、契约测试的列宽断言同步、发布说明碎片。
  - 不做：不改卡片内边距与字号（用户只提宽度与卡片间距）；不写死列数（DESIGN.md 「The No-Fixed-Grid Rule」）；不改 `DESIGN.md` 的间距尺度表——`gap-x-8` 超出表内 `gap-5` 上限，是有意的版块特例，记在代码注释里。
  - 并发结论：串行。单文件 CSS 值 + 一条测试断言，无共享写域。
- Given / When / Then：
  - Given 内容区可用宽度 811px（1080 窗口、侧栏展开），When 打开 `/allstar`，Then 卡片按 260px 最小宽度排 2 列；宽屏（1920）排 5 列；网格仍自适应填充、无横向滚动。
- 保留：`BUG-0188` 的溢出断链（`min-w-0` + 网格自身 `overflow-y-auto`）与 `BUG-0193` 的 `w-full` 撑满。
- 验证：`run-vitest.mjs --run AllstarDevHomePageView.test.tsx`；`bun run check:quick -- <改动文件>`。
- 人工验收：用户在 dev 实例目视确认卡片不再挤、间距合适。

## 交付

- 实际修改与验证：见下方「交付记录」。
- 评审与集成：自审；`integration_status` 保持 `pending`，未 push。
- 发布：`.github/release-notes/fragments/v0.1.5/allstar-home-card-density.md`。

## 交付记录

2026-11-19 实施完成（base_commit `64e8699cd`）：

- `AllstarDevHomePageView.tsx`：网格 `minmax(13rem,1fr)` + `gap-3` → `minmax(16.25rem,1fr)` + `gap-x-8 gap-y-3`，注释说明 125% 换算与 `gap-x-8` 超出设计尺度表的原因。
- `AllstarDevHomePageView.test.tsx`：契约测试的列宽断言同步为 `minmax(16.25rem,1fr)`（该测试本就锁 class 字符串，用于防止回退成固定窄卡）。
- 定向测试 18/18 通过；`check:quick` 全绿。
- 首版曾把注释写成 `{/* … */}` 放在三元表达式分支位置，esbuild 解析失败（表达式上下文不认 JSX 注释），改为块注释后通过。

### 未运行项

- 真实浏览器目视（CDP / verify:ui）：需当次授权，未执行；HMR 下用户可直接看。
- impact / 全量测试：按仓库约定作为独立行为由用户决定。

### 已知取舍

- 260px 下 1080 宽窗口由 3 列降为 2 列、1920 宽由 7 列降为 5 列；这是放大卡片的必然代价，用户已确认要加宽。
