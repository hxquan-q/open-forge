---
id: TASK-0499
type: task
status: done
priority: P2
owner: packages/ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream 8cdbc3ae6（Stepper）+ ebc127be6（StepSlider）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0497, TASK-0498]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3c31be4
read_paths:
  - packages/ui/src/index.ts
  - packages/ui/src/utils.ts
  - packages/ui/src/slider.tsx
  - packages/ui/src/button.tsx
  - packages/ui/package.json
write_paths:
  - packages/ui/src/stepper.tsx
  - packages/ui/src/stepper.test.tsx
  - packages/ui/src/step-slider.tsx
  - packages/ui/src/step-slider.test.tsx
  - packages/ui/src/index.ts
  - packages/ui/package.json
  - scripts/quality/baselines/design-exceptions.json
  - apps/desktop/DESIGN.md
  - project/tasks/TASK-0499-ui-sdk-stepper-and-step-slider.md
exclusive_paths: []
depends_on: [TASK-0497]
conflicts_with: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# UI SDK 底座 · 第二批：Stepper + StepSlider（PLAN-0032 P2 切片 3a）

## 目标

移植上游两个数值输入控件，都是纯新增、不改既有组件：

1. **Stepper**（`stepper.tsx` + `stepper.test.tsx`）：受控 `− 数值 +` 三段式步进器，step 网格、precision 收浮点、长按连加、边界禁用；依赖 `lucide-react` + `./utils`，无新包。
2. **StepSlider**（`step-slider.tsx` + `step-slider.test.tsx`）：吸附离散档位的滑块，可选刻度点，`fullWidth` 端点对齐；依赖 `./button`、`./slider`、`./utils`。
3. `package.json` exports 加 `./stepper`、`./step-slider`；`index.ts` 补导出行（按 organize-imports 排序）。

## 不做

- 不改 ReasoningStepSlider 等本地消费方去用 StepSlider（上游 ebc127be6 的本地对应改动属后续面板切片）。
- SessionTopItem / ColorSwatchPicker / color.ts 属切片 3b（TASK-0500）。

## DESIGN 例外

两个组件沿用上游视觉语言（Stepper 的 `text-[9px]`/任意值阴影，StepSlider 的刻度点尺寸类），按 TASK-0497 确立的模式登记 `design-exceptions.json` + DESIGN.md 已知例外，不改写上游 token。

## 实际交付

- `slider.tsx` 与上游对齐（animateValue / aria-valuetext / 焦点聚焦 / 拖动阈值），因为 StepSlider 需要 `animateValue`/`aria-valuetext` 且本地 Slider 此前无其他消费方；其余（Stepper + StepSlider + package.json/index.ts 导出 + design-exceptions + test-assertion-baseline + DESIGN.md 例外条目）全部落地。
- 14/14 vitest 通过；`check:quick` / `check:lint` / `check:guards` 全过；未跑 `test:impact`（新组件尚无消费方）。

## 验收（Given/When/Then）

- Given `import { Stepper } from "@vetta-org/ui/stepper"`，Then 解析到 `packages/ui/src/stepper.tsx` 且类型可用。
- Given Stepper `min=0 step=5`，When 输入 3 回车，Then 提交 5（落到 step 网格）；越界自动夹到 min/max。
- Given StepSlider `labels=["低","中","高"] index=1`，When 点击"高"标签，Then `onIndexCommit(2)`。
- `bun run check` + vitest 新增文件全过。
