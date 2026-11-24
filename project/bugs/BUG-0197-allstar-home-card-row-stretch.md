---
id: BUG-0197
type: bug
status: fixed
priority: P2
owner: apps/desktop
requirement: REQ-0030
source: user-report-2026-11-20
related_requirement: [REQ-0030]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0188, BUG-0193]
created: 2026-11-20
updated: 2026-11-20
---
<!-- Copyright The Open Forge contributors. -->

# 版块首页项目卡片只剩一行时，行高撑满剩余视口、卡片被拉得极高

## 用户流程

- Given：版块首页（Allstar 自主开发，`/allstar`）已登记的项目使卡片与「打开已有项目」空卡合计超过一行（此前 4 个项目卡 + 1 张新增卡折成上下两行）。
- When：用户从某张项目卡的「···」菜单执行「从版块移除」，剩余 4 张卡刚好排成 1 行。
- Then：这行卡片保持内容自然高度，多余空间留在网格底部。

## 实际行为

变成 1 行后，这一行的高度异常撑满剩余视口（表现为 100% 高度），所有卡片被拉得非常高（用户 2026-11-20 实机明确反馈「这是不对的」）。两行时因多出的高度被两行分摊，拉伸不易察觉，看起来正常。

## 期望行为

行高始终由卡片内容决定：无论 1 行还是多行，卡片不被纵向拉伸；同一行内卡片仍等高，卡片底部「新建会话 / 全部 N 个」仍贴卡片底；条目多时网格照常滚动。

## 环境与失败证据

- Windows 11 x64；桌面端 0.1.5 开发线，HEAD `add7ceea2`；2026-11-20 用户实机报告。
- `git blame`：网格容器的 `flex-1` 自 2026-10-27 首版首页就在（`3aaf5ff2c` 附近引入），2026-11-19 `445b66ae3` 放大卡片（13rem → 16.25rem）时原样保留；与 BUG-0195（团队会话重命名）无关，系既有布局在「行数恰好变少」时才显形的缺陷。

## 根因

文件 `apps/desktop/src/renderer/domains/allstar-dev/components/AllstarDevHomePageView.tsx:108`（修复前）：

```html
<div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(16.25rem,1fr))] gap-x-8 gap-y-3 overflow-y-auto pb-1">
```

CSS 机制链（代码可证）：

1. 外层 `section` 是 `flex min-h-0 flex-1 flex-col`，占据页头之下的全部剩余高度；
2. 网格自身也带 `flex-1`，因此在纵向 flex 链上拿到**确定高度**（等于剩余视口高）；
3. CSS Grid 默认 `align-content: stretch` + `grid-auto-rows: auto`：容器高度大于内容时，多出的高度被平均摊到每一行（隐式行轨道被拉伸）；
4. 卡片 `article` 默认 `align-self: stretch`，跟随被拉高的行一起拉满。

两行时多余高度由两行分摊，视觉上不明显；移除一个项目后只剩一行，这一行独吞全部多余高度，卡片被拉到撑满剩余视口。

## 修复

同一行加 Tailwind `content-start`（`align-content: start`），行高回归内容自然高度，多余空间留在容器底部而非摊给行：

```html
<div className="grid min-h-0 flex-1 content-start grid-cols-[repeat(auto-fill,minmax(16.25rem,1fr))] gap-x-8 gap-y-3 overflow-y-auto pb-1">
```

不改列宽（16.25rem）、`gap-x-8` / `gap-y-3`、`overflow-y-auto`、`flex-1` 与 `min-h-0`——滚动与列自适应合同保持不变（BUG-0188 / BUG-0193 的教训不回退）。

## 回归测试

`AllstarDevHomePageView.test.tsx` 既有网格断言处补一条：`grid.className` 包含 `content-start`。JSDOM 不做真实布局，class 断言即可，不写依赖真实高度的断言。

## 验证

- 定向测试：`AllstarDevHomePageView.test.tsx` 全绿（apps/desktop cwd 下经 `run-vitest.mjs` 运行）。
- `bun run check:quick`（改动文件）与完整 `bun run check` 通过。
- impact / 全量测试未跑（本机两处既有环境失败：ssh-transport 符号链接权限、vetta-ui-design TEMP 8.3 短名，见 BUG-0195 记录）；按验证纪律留待用户决定是否以 `--base xquan` 单独发起。

## 待实机复核

用户在真实版块数据上复核：4 卡 + 新增卡两行时行高自然；移除 1 个项目后单行卡片不再拉伸；同行卡片等高、底部操作行仍贴底；条目多时网格可滚动；列数与间距不变。
