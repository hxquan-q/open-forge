---
id: BUG-0039
type: bug
status: done
priority: P2
owner: apps/desktop renderer (sidebar / guide banner / agent selector)
requirement:
plan:
source: VERIFY-0010 实机验收中的 axe 可访问性审计
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 新会话页可访问性审计命中三类违规：图标按钮无名称、交互控件嵌套、内容不在 landmark

## 用户流程

- Given：键盘或读屏用户打开新会话页（界面语言 `zh`）
- When：用读屏遍历侧边栏项目行、快捷面板推广条与智能体选择 chip
- Then：每个可聚焦控件都有可分辨的名称，焦点顺序与语义结构清晰

## 实际行为

axe-core 4.12.1 审计（首屏，未展开任何浮层）：

```text
passes: 31   violations: 3（共 4 个节点）   incomplete: 1（color-contrast，27 个节点，均为「背景色被其它元素覆盖无法判定」）
```

1. `button-name`（impact: **critical**，1 节点）——侧边栏项目行里的文件夹图标按钮没有可访问名称：

   ```html
   <button type="button" class="relative flex shrink-0 items-center justify-center">
     <span class="icon-[solar--folder-linear] h-4 w-4 text-foreground"></span>
   </button>
   ```

   该按钮位于项目 `demo` 行内（16×16 px，坐标 16,271），没有 `aria-label`、`title` 或文本。

2. `nested-interactive`（impact: serious，2 节点）——交互控件嵌套可聚焦子元素：
   - 快捷面板推广条：外层 `button`（「Open Forge 支持快捷面板，点击前往设置开启」）内含「不再提示」控件；
   - 智能体选择 chip：`div[role="button"][aria-label="指定一个团队或单个智能体来完成这次任务"]` 内含可聚焦按钮「戳一下」。

3. `region`（impact: moderate，2 节点）——标题栏品牌块与应用侧边栏空态文本不在任何 landmark 内。

## 期望行为

这三个位置通过 axe 的核心规则：图标按钮有明确可访问名称（例如按实际语义声明「展开/折叠 <项目名>」），交互控件不嵌套可聚焦子元素，标题栏与侧边栏内容归入 `header` / `aside` 等 landmark。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：`main` @ `53995f8c7`（Desktop dev 构建）；Windows 11；agent-browser 0.38.1 + axe-core 4.12.1（`agent-browser a11y --json`）；窗口 1280×800；语言 `zh`
- 审计 URL：`#/new-session?cwd=<…>\conversation`（Debug Profile `04987e4e`）
- 完整 axe `tags` 与 `helpUrl` 见审计输出（`button-name`：`wcag2a` / `wcag412`；`nested-interactive`：`cat.keyboard`；`region`：`best-practice`）
- 基线对照或重跑结果：同页重载后一致；未在其它页面逐个复跑审计

## 最小复现

1. 启动任一验证实例（`verify:ui:start:debug`），使界面停在项目列表含条目的新会话页
2. 运行 `agent-browser connect <ui.endpoint> --session <name>` 后执行 `agent-browser --session <name> a11y --json`
3. 观察 `violations` 中的 `button-name` / `nested-interactive` / `region`

## 影响

- 读屏用户无法得知文件夹图标按钮的作用（critical，按钮名缺失）；键盘/读屏用户在内嵌交互上会遇到焦点语义混乱（button 嵌 button）。
- 鼠标主流程不受影响，因此视觉验收不会自发暴露该问题。

## 根因证据

- 侧边栏项目行渲染的折叠/展开按钮只有图标元素，未声明 `aria-label`/`title`（DOM 快照见上）。
- 推广条与智能体 chip 把次要动作作为子节点放在可点击容器内（同一 DOM 子树里出现两个可聚焦控件），与 axe `nested-interactive` 的判定一致。
- 标题栏品牌与侧边栏空态段落不在 `header`/`aside` 等 landmark 内。

## 回归测试

建议对这三个组件补可访问语义断言（`@testing-library/react`）：

1. 侧边栏项目行：查询该按钮并断言 `getByRole("button", { name: … })` 能命中（即名称非空且唯一）；
2. 推广条 / 智能体 chip：断言容器内不存在嵌套的可聚焦 `button`/`[role="button"]`；
3. 若后续引入 axe 到组件测试，可用 `jest-axe`/`vitest-axe` 对该三组件做定向审计（避免整页大面积规则噪声）。

## 修复与验证

- 修复（2026-09-26，两项 WCAG 违规）：
  1. `packages/theme-ui/src/project/ProjectRowView.tsx`：新增可选 `toggleTitle` 并把它作为图标按钮的 `aria-label`/`title`；宿主链路 `useProjectGroupModel`（新增 `sidebar.projects.toggleSessions` 文案，zh/en 同步）→ `ProjectGroup` → `ProjectRow` → `useProjectRowModel` 一路下发。
  2. `packages/theme-ui/src/chat/GuideBadgeSwiperView.tsx`：药丸改成容器 `div`，「正文动作」与「不再提示」成为并列按钮（不再嵌套）；`apps/desktop/.../NewSessionAgentSelector.tsx`：触发器里的装饰头像用 `<span class="contents" aria-hidden inert>` 包住，把 `BotAvatar` 自身的 `<button>` 移出无障碍树与焦点序列（指针行为本来就是 `pointer-events-none`，视觉不变）。
- 测试（新增 2 个 desktop 侧回归文件，共 5 例）：
  - `ProjectRowView.a11y.test.tsx`：图标按钮以 `toggleTitle` 为名称；折叠态点击仍展开并导航、展开态只折叠。
  - `GuideBadgeSwiperView.a11y.test.tsx`：正文动作内无可聚焦嵌套控件、两者各自触发自己的回调、不可关闭时没有「不再提示」。
- 实机验证（axe-core 4.12.1，CDP 附着新会话页）：`violations 3 → 1`、节点数 `4 → 2`；`button-name`（critical）与 `nested-interactive`（serious）归零；侧栏无名按钮计数从 1 → 0；项目行图标按钮实测名称「展开或折叠「demo」的会话」。
- 补充修复（2026-09-26，`region` 与收口项，同工作区并行会话补做）：
  3. `packages/theme-ui/src/sidebar/SidebarPanel.tsx`：面板根节点加 `role="complementary"` 与 `aria-label`（经 `DefaultSidebar.panelLabel` 由桌面宿主传入 `sidebar.regionLabel`，zh「侧边栏」/ en「Sidebar」）——品牌、导航、项目区全部落入该 landmark，`region` 违规闭合；不动标题栏结构。新增 `SidebarPanelLandmark.test.tsx` 锁定。
  4. `GuideBadgeSwiperView` 的「不再提示」去掉 `tabIndex={-1}`：成为并列控件后不应再把键盘用户挡在焦点序列之外；`GuideBadgeSwiperView.a11y.test.tsx` 补 tabbable 断言。
  5. `BotAvatar` 新增 `interactive` prop（默认 true 不变），`interactive={false}` 时渲染非按钮装饰节点；`NewSessionAgentSelector` 的触发器用它替代 inert 包裹方案，DOM 中不再存在第二颗按钮。`BotAvatar.test.tsx` 与 `NewSessionAgentSelector.test.tsx` 各补一例。
- 仍开放：无。`region` 已按上条闭合（component 级断言已绿；axe 全量复跑建议随下一轮实机验收进行）。
- 未运行及原因：其它页面（能力库、设置、会话页）未逐个跑 axe。另注：`packages/theme-ui` 自身测试未被任何门禁收集（该包没有 `test` 脚本、desktop vitest 的 include 也不含它），因此这两个回归测试放在 desktop 侧，确保会随 `test:pkg desktop` / `test:changed` 运行。
