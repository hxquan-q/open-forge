---
id: TASK-0539
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 6d2f00bbe
read_paths: []
write_paths:
  - packages/plugins/presets/vetta-ui-design/
  - project/tasks/
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 设计画廊 iframe 性能移植：风格墙与设计资源 Dialog 悬停停留才挂 demo

## 合同

- 来源与目标：上游三个提交 `d99e32377`（画廊风格墙静止不挂 iframe）、`57e3136a1`（停留逻辑抽共用 hook）、`867179b27`（设计资源 Dialog 同病同治）。本仓文件与上游 pre-change 状态基本一致，分叉极小，直接落三提交合并后的最终态。
- 输入 → 输出：上游最终态 → 本仓等价行为：风格墙与设计资源 Dialog 静止只铺封面，悬停（或键盘聚焦）停留 160ms 才挂载被停留那一张卡的 demo iframe，移开即卸。
- 做 / 不做：只做这三提交的等价物；不改 demo 预览本身的滚动/缩放机制。
- Given / When / Then：
  - 风格墙或设计资源 Dialog 静止列出多张带 demo 的卡 → 一个 iframe 都不挂，只铺 token 封面。
  - 悬停某卡停留超过 160ms → 只挂载那一张卡的 demo iframe 并开始滚动预览；掠过不停留不挂。
  - 移开或失焦 → 该 iframe 卸载。
- 验证：移植的两个测试文件新增用例（DOM 查询计数 iframe，非调用类断言）；`bun run test:impact`；`bun run check`。
- 人工验收：不适用（性能缺陷修复，行为对照明确）；工程完成标准为移植到位且检查全绿。

## 交付

- 实际修改与验证：
  - 直接落三提交合并后的最终态：`DesignSystemTileContent` 包 `memo`（行为不变，防宫格重渲染级联）；新增 `src/gallery/use-demo-dwell.ts`（逐字移植，160ms 停留计时 + handlersFor 分派 mouseenter/leave/focus/blur）；`DesignSystemGrid` 与 `TemplateGalleryDialog` 接入 hook，`demo`/`demoActive` 同传 `demoId === system.id`，静止时一张 iframe 都不挂。
  - 测试移植：grid 测试存量「悬停点燃」用例补 fake timers（上游同改）；两个测试文件各新增「iframe 预算」describe（静止零 iframe、停留后才挂一张、移开即卸），均为 DOM 计数行为断言；Dialog 测试补 `locale` mock、IntersectionObserver stub（happy-dom 缺失）与 registry reset。
  - 验证：定向 vitest 2 文件 16/16 通过；`bun run test:impact`（4 源文件）131 文件 934 用例全过；`bun run check` exit 0（lint/types/guards 全绿，modified-notices missing=0）。
- 评审与集成：主代理串行实施；独立 verifier 复查 pass（complete）——逐字比对上游最终态确认无漏改/漂移，计时器清理与 A→B 穿越竞态正确，`DesignStyleLibrary`（新会话宫格）早已自带悬停预算无需改；两条低级观察（存量用例 fake timers 无 try/finally、插件测试不在 biome/tsc 覆盖内）均为上游同源或仓库既有配置，不处理。
- 未运行与风险：未真机验证滚动流畅度（行为合同以 iframe 计数断言锁定）；iframe 卸载依赖 React 重渲染时序，happy-dom 外的真实浏览器行为与上游一致未单独验证。
- 发布：release fragment `design-gallery-iframe-budget.md`（修复类，已 assemble）。
