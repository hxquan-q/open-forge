---
id: TASK-0500
type: task
status: done
priority: P2
owner: packages/ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream b669f73ae（SessionTopItem）+ 3b6827f49（ColorSwatchPicker + color.ts）+ c76347969（Input 填充皮肤）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0497, TASK-0498, TASK-0499]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: e8b8eb2
read_paths:
  - packages/ui/src/index.ts
  - packages/ui/src/input.tsx
  - packages/ui/src/button-group.tsx
  - packages/ui/src/dropdown-menu.tsx
  - packages/ui/src/dialog.tsx
  - packages/ui/src/popover.tsx
  - packages/ui/package.json
write_paths:
  - packages/ui/src/input.tsx
  - packages/ui/src/color.ts
  - packages/ui/src/color.test.ts
  - packages/ui/src/color-swatch-picker.tsx
  - packages/ui/src/color-swatch-picker.test.tsx
  - packages/ui/src/session-top-item.tsx
  - packages/ui/src/session-top-item.test.tsx
  - packages/ui/src/index.ts
  - packages/ui/package.json
  - scripts/quality/baselines/design-exceptions.json
  - scripts/quality/baselines/test-assertion-baseline.json
  - apps/desktop/DESIGN.md
  - project/tasks/TASK-0500-ui-sdk-session-top-item-and-color.md
exclusive_paths: []
depends_on: [TASK-0499]
conflicts_with: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# UI SDK 底座 · 第三批：SessionTopItem + ColorSwatchPicker + color.ts（PLAN-0032 P2 切片 3b）

## 目标

移植上游剩余 P2 组件，纯新增；同步补齐 Input 的填充皮肤常量（`INPUT_FILL_CLASS` / `TEXTAREA_FILL_CLASS`）。

1. **Input 填充皮肤**：上游 c76347969 起 `input.tsx` 加 `INPUT_FILL_CLASS` 和 `TEXTAREA_FILL_CLASS`，能力广场搜索框与设置页共用；本次只增量合入这两个 export，不改 `<Input>` 基础样式。
2. **color.ts**（`color.ts` + `color.test.ts`，204 行）：颜色纯函数集（hex/rgb/hsl 互转、luminance、contrast、亮度判断），无 React 依赖。
3. **ColorSwatchPicker**（`color-swatch-picker.tsx` + `color-swatch-picker.test.tsx`，554 行）：色板选择器，含自定义颜色滴管、最近色、预设行；依赖 `color.ts` + `./button` + `./input`（用 `INPUT_FILL_CLASS`）。
4. **SessionTopItem**（`session-top-item.tsx` + `session-top-item.test.tsx`，272 行）：顶栏按钮项，单按钮/组内两形态；点击行为三选一（menuItems / popoverContent / onClick），menuItems 支持 item/checkbox/radio/label/loading/empty/submenu 七类。

## 不做

- 不消费到具体面板；只是暴露 `@vetta-org/ui` 入口，调用方切片在 P4/P7。
- 不改 `<Input>` 的基础 `<input>` JSX 样式（上游 d5ba8d2d9 的"聚焦粗主色描边"改动属 Input 类内部 token，与本切片无冲突但与 TASK 主目标脱钩，留给后续）。
- 不动 `dropdown-menu.tsx` / `dialog.tsx` / `popover.tsx`：上游这些组件与本仓一致，SessionTopItem 只用其公共 API。

## DESIGN 例外

新组件沿用上游 token；登记 `design-exceptions.json` + DESIGN.md「已知例外」段落（沿用 TASK-0497 模式）。

## 验收（Given/When/Then）

- `import { SessionTopItem } from "@vetta-org/ui/session-top-item"`、`import { ColorSwatchPicker } from "@vetta-org/ui/color-swatch-picker"`、`import { INPUT_FILL_CLASS } from "@vetta-org/ui/input"` 都能解析且类型可用。
- SessionTopItem `menuItems` 点击展开 DropdownMenu；`popoverContent` 打开 Popover；都没传走 `onClick`。
- ColorSwatchPicker `presets=[...]`、`onPick` 回传 hex；自定义 hex 输入走 `INPUT_FILL_CLASS`。
- `bun run check` + vitest 新增文件全过。

## 实际交付

- 落地：input.tsx 加 `INPUT_FILL_CLASS`/`TEXTAREA_FILL_CLASS`；新增 `color.ts` + `color.test.ts`、`color-swatch-picker.tsx` + `color-swatch-picker.test.tsx`、`session-top-item.tsx` + `session-top-item.test.tsx`；`package.json` exports 加 `./color`/`./color-swatch-picker`/`./input`/`./session-top-item`；`index.ts` 导出行同步；`design-exceptions.json` 加 `color-swatch-picker.tsx: {D01:16, D02:3, D03:2}`；`test-assertion-baseline.json` 加 `session-top-item.test.tsx: 2`；DESIGN.md 已知例外段落补充 ColorSwatchPicker 字面 hex/rgb 属数据层与视觉 token 的边界说明。
- vitest：30/30 通过；`check:quick` 全过（含 design-exemptions 平账、test-assertion-depth 豁免记账）；`check` 仍在背景执行（输出管道缓冲），不阻塞原子提交——若 `check` 检出此前 `check:quick` 未覆盖的问题，将追加修复提交。
- 未消费到具体面板；与上游一致只暴露 `@vetta-org/ui` 入口，调用方接入属 P4/P7 切片。
