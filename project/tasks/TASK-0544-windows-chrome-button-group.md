---
id: TASK-0544
type: task
status: verifying
priority: P3
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0543]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 781478ef2
read_paths: []
write_paths:
  - apps/desktop/src/renderer/styles.css
  - apps/desktop/src/renderer/domains/header-actions/
  - packages/theme-ui/src/chat/HeaderActionBarView.tsx
  - packages/theme-ui/src/chat/HeaderActionOverflowMenu.tsx
  - project/tasks/
  - project/research/RESEARCH-0052-upstream-0.6.20-0.6.31-commit-triage.md
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# Windows 窗口 chrome 按钮组：玻璃按扁平画 + 常驻组用幽灵外观

## 合同

- 来源与目标：上游 `069cad7fa` 的 CSS 部分、`4b7cb3a17`（已被前者取代，按后者方案）、`4e0914d70` 的组件接法。台账 RESEARCH-0052「改写后采纳」之 Windows 按钮组三项。落点核对结论（2026-11-27）：
  - `chromeButtonGroupVariant` 已存在（`packages/theme-ui/src/shared/platform.ts`，Windows 为 ghost、其余 glass）；`SpaceSwitcher` 已使用。
  - 缺口 1：`apps/desktop/src/renderer/styles.css` 没有 Windows 上去玻璃的两条规则（`069cad7fa` 在 styles.css 新增 11 行，本仓未带入）。
  - 缺口 2：`HeaderActionBarView.tsx` 常驻的两处 ButtonGroup（顶栏动作组 `narrow === null` 分支、活动面板开关组）与 `HeaderActionOverflowMenu.tsx` 的更多菜单组未传 `variant={chromeButtonGroupVariant}`。
  - 不适用：`SettingsMenuTriggerView` 本仓已重写为普通 `<button>`（无 ButtonGroup），上游该处改动跳过；`emptyBar` 虚线占位组本来就是 bg-transparent；「调整」与收纳浮动胶囊按 fork 的 OPAQUE_GLASS 意图保持玻璃质感（浮层贴内容而非 chrome 墙面），不传 chrome variant。
- 输入 → 输出：上游最终态语义 → Windows 上常驻胶囊底消失、玻璃组按扁平画。
- 做 / 不做：只做 CSS 两条规则 + 三处 variant 传参 + 对应测试；不动 `packages/ui` 的 button-group（已与上游逐字一致）；不碰浮动收纳/调整胶囊的外观。
- Given / When / Then：
  - Windows 上任意 glass 按钮组 → CSS 命中 `[data-variant="glass"]`：backdrop-filter 移除；深色下另清 box-shadow（浅色阴影保留，launcher 浮动按钮组不受影响）。
  - 宽布局渲染 HeaderActionBarView → 顶栏动作组与面板开关组的 `data-variant` 等于 `chromeButtonGroupVariant`（Windows 为 ghost）。
  - 窄布局渲染更多菜单 → 收纳菜单组的 `data-variant` 同为 chrome variant。
  - macOS / Linux（非 windows 平台）行为不变：variant 恒为 glass。
- 保留：button-group 组件三 variant 语义不变；浮动胶囊 OPAQUE_GLASS 不变；emptyBar 虚线占位样式不变。
- 验证：扩展 `apps/desktop/src/renderer/domains/header-actions/HeaderActionBarView.narrow.test.tsx` 加 data-variant 断言（捕获式/DOM 断言）；`bun run test:impact`；`bun run check`。CSS 为纯新增 Windows-only 规则，不做目视验收（静态规则与 selector 对照 `shared/lib/platform.ts` 的 data-platform 机制锁定）。
- 人工验收：不适用（平台观感优化，Windows-only 行为；静态合同由测试与规则核对锁定）。

## 交付

- 实际修改与验证：
  - CSS（`069cad7fa` 样式部分逐字移植）：`apps/desktop/src/renderer/styles.css` 新增两条 Windows-only 规则——glass 按钮组清 `backdrop-filter`、深色下另清 `box-shadow`。verifier 程序化比对确认与上游逐字相等；阴影本就是 `dark:shadow-[...]` 深色专属，浅色与 launcher 浮动按钮组自带阴影不受影响；规则位于 `@layer base` 之外，压过 Tailwind utilities。
  - 组件（`4e0914d70` 接法）：`HeaderActionBarView.tsx` 宽布局动作组与活动面板开关组、`HeaderActionOverflowMenu.tsx` 更多菜单组加 `variant={chromeButtonGroupVariant}`；「调整」浮动胶囊、emptyBar 虚线占位组、收纳托盘刻意不传（浮层贴内容而非 chrome 墙面 / 本就透明 / 非 ButtonGroup）。`SettingsMenuTriggerView` 本仓已是普通 `<button>`，上游该处不适用。
  - 测试：`HeaderActionBarView.narrow.test.tsx` 追加 4 个用例（10/10 通过）——首版被 verifier 判为恒真断言（jsdom 下 `detectKbdPlatform` 落 linux，chromeButtonGroupVariant 恒 glass）且 DOM 顺序错误，重写为 `navigator.platform` 打桩 + `vi.resetModules` 动态导入让模块重新求值：先断言模块常量确实随平台变化（Win32→ghost / MacIntel→glass），再按按钮 `closest` 定位所在组断言 data-variant，「调整」胶囊在 Win32 下保持 glass。全部 DOM 断言，零 `toHaveBeenCalled*`。
  - 验证：定向 vitest 10/10；`bun run test:impact` desktop 1172 文件 6859 用例通过（唯一失败 `desktop-remote-connector.websocket.test.ts` 为环境性既有问题——本机 `billion-context` 服务占用端口 18787 导致 fake relay 起不来，隔离重跑同样失败，与本改动无关）；`bun run check` exit 0（lint/types/guards/mobile 全绿、modified-notices missing=0）。
- 评审与集成：主代理串行实施；独立 verifier 复查生产代码部分 pass（CSS 逐字等价、选择器与 data-platform/data-mode 机制吻合、无漏传的常驻 chrome 组），测试部分 fail 的两条 P2 已全部修复并复跑通过。P3 观察——「调整」胶囊在 Windows 深色下阴影也会被 CSS 清掉（与上游一致的行为，verifier 判为可接受），保留原样并在 Task 记录。
- 未运行与风险：未真实 Windows 桌面目视（静态合同由平台打桩测试与 CSS 机制核对锁定）；`billion-context` 占用 18787 时该 websocket 集成测试在本机不可运行。
- 发布：release fragment `windows-chrome-button-group.md`（改进类，已 assemble）。
