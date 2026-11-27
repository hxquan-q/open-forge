---
id: TASK-0542
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
base_commit: 2541df297
read_paths: []
write_paths:
  - packages/theme-ui/src/markdown/
  - packages/theme-ui/src/chat/
  - apps/desktop/src/renderer/domains/conversation/components/blocks/
  - apps/desktop/src/renderer/domains/conversation/components/input-bar/
  - apps/desktop/src/renderer/shared/components/message-input/
  - apps/desktop/src/renderer/shared/hooks/useMarkdownLabels.ts
  - apps/desktop/src/shared/i18n/locales/
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

# 体验类移植批：Mermaid 图表操作与输入栏细节打磨

## 合同

- 来源与目标：上游 9 个提交合并为一批 UI 体验微调，本仓文件均处于 pre-change 状态，直接落合并后的最终态：
  - Mermaid 五件套 `d2d267722`（抽出 useImageActions 共用 hook）+ `3686687a6`（viewBox 固有尺寸）+ `a73f1524d`（深色主题用浅色配色+灰画布）+ `b8bd42467`（复制/另存带白底）+ `da7a476a5`（操作收进代码块顶栏、取消限高）。
  - 输入框 `e9b6945f8`（发送按钮外壳加 flex，回复中打字输入框不跳高）。
  - 用量环 `fef618780`（轨道用 muted-foreground 35%）+ `808d86ecd`（tooltip 改 Radix Portal 不被活动面板遮挡）。
  - 输入栏描边 `807d43b81`（深浅色都压淡，聚焦降到 10% 主色）。
- 输入 → 输出：上游最终态 → 本仓等价行为与测试。
- 做 / 不做：只做这 8 提交的等价物；不碰输入预测、活动面板浅色取舍等未拍板项。
- Given / When / Then：
  - 渲染 mermaid 代码块且流结束 → 深色主题下按浅色配色绘制在 #e4e4e7 灰画布上，放大/复制/另存图标收进代码块顶栏（悬停显现），复制与另存带 #ffffff 白底，SVG 按 viewBox 固有尺寸显示不限高。
  - AI 回复中输入文字、发送按钮切换为队列按钮 → 输入框总高度不变。
  - 悬停上下文用量环 → tooltip 挂在 document.body（Radix Portal），不被 isolate/overflow-clip 裁切；轨道槽在深浅主题下均可见。
  - 输入栏表面：静态描边 border-border/60（暗色 /70），聚焦时 border-primary/10 且不含静态淡边框。
- 验证：移植的测试用例（preview-policy 纯函数断言、MarkdownMedia 行为断言、ContextRingView Portal 归属断言、InputBarToolbar/MessageInput classList 断言）；`bun run test:impact`；`bun run check`。
- 测试纪律：移植用例改写为 DOM/捕获式断言，不新增 `toHaveBeenCalled*`；存量断言不动，基线只降不升。
- 人工验收：不适用（体验修复，行为对照明确）；工程完成标准为移植到位且检查全绿。

## 交付

- 实际修改与验证：
  - Mermaid 五件套：新建 `packages/theme-ui/src/markdown/image-actions.ts`（useImageActions 逐字移植 + Modified 头）；`preview-policy.ts` 新增 `withIntrinsicSize`/`withBackground` 纯函数 + `preview-policy.test.ts`；`MermaidBlock.tsx` 落上游最终态（renderMermaid 固定 "light"、深色 #e4e4e7 灰画布、导出 #ffffff 白底、操作收进顶栏 icon-sm ghost 按钮悬停显现、裸 img 不限高）；`MarkdownImage.tsx` 重构共用 useImageActions（保留本仓 `@vetta-org/ui` 根入口导入风格）；`rich-labels.ts`/`useMarkdownLabels.ts`/zh/en chat.json 加 copyImage 标签。
  - 单件四提交：`InputBarToolbar.tsx` 外壳 flex shrink-0；`ContextRingView.tsx` 落 Radix Portal tooltip + 轨道 35% muted-foreground 兜底 + 新建 `ContextRingView.test.tsx`；`MessageInputView.tsx` 描边压淡、聚焦 border-primary/10。
  - 测试：`MarkdownMedia.test.tsx` 加放大/复制/另存（白底断言）与深色灰画布两例，全部捕获式/DOM 断言，零新增 `toHaveBeenCalled*`；深色用例按 verifier 建议升级为 palette 注入端到端断言（mock 按 theme 返回 `palette-${theme}`，断言显示侧含 palette-light 不含 palette-dark）；fixture mock 参数收紧为 `"light" | "dark"` 联合类型。`InputBarToolbar.test.tsx` 加 flex 用例；`MessageInput.test.tsx` 更新 token 断言。
  - 基线：`design-exceptions.json` 登记 MermaidBlock D01:2（#e4e4e7/#ffffff 数据层色）与 ContextRingView D01:1（#888 为 var() 兜底值），`apps/desktop/DESIGN.md` 已知例外加对应说明。
  - 验证：定向 vitest preview-policy 3 + ContextRingView 1 + MarkdownMedia 10 + InputBarToolbar 5 + MessageInput 4 全过（加固后 MarkdownMedia 复跑 10/10）；`bun run test:impact` desktop 104 文件 589 用例 + theme-ui 9 文件 48 用例全绿（加固改动前执行，改动仅测试侧且已定向复跑 + check:quick 通过）；`bun run check` exit 0（lint/types/guards/mobile 全绿、modified-notices missing=0、design 平账、断言棘轮 2435 文件通过）。
- 评审与集成：主代理串行实施；独立 verifier 复查 pass——9 个上游 SHA 的文件并集与工作区改动一致无漏改无夹带，逐文件 diff 确认差异仅声明头与已声明风格分叉；renderMermaid 固定 light 的缓存键一致性、主题切换重渲染路径、useImageActions generation 竞态、Radix Portal 用法均核对无误。两条低风险观察（测试断言强度、mock 类型）已按建议加固；版权头措辞与冗余负向断言为存量，不动。
- 未运行与风险：未真机目视验证 Mermaid 深色灰画布与 tooltip 层叠（行为合同以 DOM/数据断言锁定）；InputBar flex 修正在发送中态切换的实际跳动未目视验证。
- 发布：release fragment `mermaid-toolbar-input-polish.md`（改进类，已 assemble）。
